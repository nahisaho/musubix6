package rollup

import (
	"errors"
	"math"
	"sort"
	"sync"

	"example.com/metrics/contract"
	"example.com/metrics/ingest"
)

var (
	ErrCardinality = errors.New("ErrCardinality")
	ErrLate        = errors.New("ErrLate")
	ErrEmpty       = errors.New("ErrEmpty")
	ErrQuantile    = errors.New("ErrQuantile")
	ErrRange       = errors.New("ErrRange")
)

type Options struct{ Retention []int64 }

type Cell struct {
	Count, Sum, Min, Max uint64
	Hist                 map[int]uint64
	Saturated, Rolled    bool
}

type Entry struct {
	Series string
	Tier   int
	Start  int64
	Cell   Cell
}

type cellKey struct {
	series string
	tier   int
	start  int64
}

type Engine struct {
	mu        sync.Mutex
	cfg       *contract.Config
	secs      []int64
	retention []int64
	cells     map[cellKey]*Cell
	perSeries map[string]int
	rolledEnd []int64
	wm        int64
	haveWM    bool
}

var defaultRetention = []int64{2 * 3600, 86400, 30 * 86400}

func New(cfg *contract.Config, opts Options) *Engine {
	e := &Engine{cfg: cfg, cells: map[cellKey]*Cell{}, perSeries: map[string]int{}}
	for _, t := range cfg.Tiers {
		e.secs = append(e.secs, t.Seconds)
	}
	e.rolledEnd = make([]int64, len(e.secs))
	for i := range e.rolledEnd {
		e.rolledEnd[i] = math.MinInt64
	}
	e.retention = make([]int64, len(e.secs))
	for i := range e.retention {
		if i < len(opts.Retention) {
			e.retention[i] = opts.Retention[i]
		} else if i < len(defaultRetention) {
			e.retention[i] = defaultRetention[i]
		}
	}
	return e
}

// @id CODE-ROLLUP-002
// @implements REQ-ROLLUP-002
func Align(ts, secs int64) int64 {
	r := ts % secs
	if r < 0 {
		r += secs
	}
	return ts - r
}

// @id CODE-ROLLUP-013
// @implements REQ-ROLLUP-013
func inRange(ts, top int64) bool {
	r := ts % top
	if r < 0 {
		r += top
	}
	return ts >= math.MinInt64+r && ts-r <= math.MaxInt64-top
}

func satAdd(a, b uint64) (uint64, bool) {
	s := a + b
	if s < a {
		return math.MaxUint64, true
	}
	return s, false
}

func (c *Cell) addPoint(v uint64) {
	if c.Hist == nil {
		c.Hist = map[int]uint64{}
	}
	if c.Count == 0 || v < c.Min {
		c.Min = v
	}
	if v > c.Max {
		c.Max = v
	}
	var sat bool
	c.Count, sat = satAdd(c.Count, 1)
	c.Saturated = c.Saturated || sat
	c.Sum, sat = satAdd(c.Sum, v)
	c.Saturated = c.Saturated || sat
	i := contract.BucketIndex(v)
	c.Hist[i], sat = satAdd(c.Hist[i], 1)
	c.Saturated = c.Saturated || sat
}

// merge folds the child's totals into c.
func (c *Cell) merge(ch *Cell) {
	if ch.Count == 0 {
		return
	}
	if c.Hist == nil {
		c.Hist = map[int]uint64{}
	}
	if c.Count == 0 || ch.Min < c.Min {
		c.Min = ch.Min
	}
	if ch.Max > c.Max {
		c.Max = ch.Max
	}
	sat := ch.Saturated
	var s bool
	c.Count, s = satAdd(c.Count, ch.Count)
	sat = sat || s
	c.Sum, s = satAdd(c.Sum, ch.Sum)
	sat = sat || s
	for i, n := range ch.Hist {
		c.Hist[i], s = satAdd(c.Hist[i], n)
		sat = sat || s
	}
	c.Saturated = c.Saturated || sat
}

func (e *Engine) cell(k cellKey) *Cell {
	c := e.cells[k]
	if c == nil {
		c = &Cell{}
		e.cells[k] = c
		e.perSeries[k.series]++
	}
	return c
}

func (e *Engine) parentKey(k cellKey) cellKey {
	return cellKey{k.series, k.tier + 1, Align(k.start, e.secs[k.tier+1])}
}

// @id CODE-ROLLUP-001
// @implements REQ-ROLLUP-001, REQ-ROLLUP-003, REQ-ROLLUP-008, REQ-ROLLUP-012
func (e *Engine) Add(p ingest.Point) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	series := ingest.SeriesKey(p)
	if top := e.secs[len(e.secs)-1]; !inRange(p.TS, top) {
		return ErrRange
	}
	if _, ok := e.perSeries[series]; !ok && len(e.perSeries) >= e.cfg.Limits.MaxSeries {
		return ErrCardinality
	}
	k := cellKey{series, 0, Align(p.TS, e.secs[0])}
	chain, err := e.lateChain(k)
	if err != nil {
		return err
	}
	c := e.cell(k)
	c.addPoint(p.Value)
	if chain != nil {
		c.Rolled = true
		for _, pk := range chain {
			e.cells[pk].addPoint(p.Value)
		}
	}
	if !e.haveWM || p.TS > e.wm {
		e.wm, e.haveWM = p.TS, true
	}
	return nil
}

// lateChain returns the ancestors a late point must amend (nil when the cell is not late).
func (e *Engine) lateChain(k cellKey) ([]cellKey, error) {
	if len(e.secs) < 2 || k.start >= e.rolledEnd[0] {
		return nil, nil
	}
	var chain []cellKey
	for cur := k; cur.tier < len(e.secs)-1; {
		pk := e.parentKey(cur)
		if _, ok := e.cells[pk]; !ok {
			return nil, ErrLate
		}
		chain = append(chain, pk)
		if pk.tier >= len(e.secs)-1 || pk.start >= e.rolledEnd[pk.tier] {
			break
		}
		cur = pk
	}
	return chain, nil
}

// @id CODE-ROLLUP-004
// @implements REQ-ROLLUP-004, REQ-ROLLUP-005, REQ-ROLLUP-006
func (e *Engine) Roll() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.haveWM {
		return
	}
	for t := 0; t < len(e.secs)-1; t++ {
		var keys []cellKey
		for k, c := range e.cells {
			if k.tier == t && !c.Rolled && e.parentKey(k).start+e.secs[t+1] <= e.wm {
				keys = append(keys, k)
			}
		}
		for _, k := range keys {
			e.cell(e.parentKey(k)).merge(e.cells[k])
			e.cells[k].Rolled = true
		}
		if end := Align(e.wm, e.secs[t+1]); end > e.rolledEnd[t] {
			e.rolledEnd[t] = end
		}
	}
}

// @id CODE-ROLLUP-009
// @implements REQ-ROLLUP-009
func (e *Engine) Evict(now int64) int {
	e.mu.Lock()
	defer e.mu.Unlock()
	n := 0
	for k, c := range e.cells {
		top := k.tier == len(e.secs)-1
		if (c.Rolled || top) && k.start+e.secs[k.tier]+e.retention[k.tier] <= now {
			delete(e.cells, k)
			n++
			if e.perSeries[k.series]--; e.perSeries[k.series] <= 0 {
				delete(e.perSeries, k.series)
			}
		}
	}
	return n
}

func (e *Engine) Get(series string, tier int, start int64) (Cell, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	c, ok := e.cells[cellKey{series, tier, start}]
	if !ok {
		return Cell{}, false
	}
	return copyCell(c), true
}

func copyCell(c *Cell) Cell {
	out := *c
	out.Hist = make(map[int]uint64, len(c.Hist))
	for i, n := range c.Hist {
		out.Hist[i] = n
	}
	return out
}

// @id CODE-ROLLUP-010
// @implements REQ-ROLLUP-010
func (e *Engine) Snapshot() []Entry {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]Entry, 0, len(e.cells))
	for k, c := range e.cells {
		if c.Count == 0 {
			continue
		}
		out = append(out, Entry{k.series, k.tier, k.start, copyCell(c)})
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Series != b.Series {
			return a.Series < b.Series
		}
		if a.Tier != b.Tier {
			return a.Tier < b.Tier
		}
		return a.Start < b.Start
	})
	return out
}

// @id CODE-ROLLUP-007
// @implements REQ-ROLLUP-007
func Quantile(c Cell, q float64) (uint64, error) {
	if math.IsNaN(q) || q < 0 || q > 1 {
		return 0, ErrQuantile
	}
	if c.Count == 0 {
		return 0, ErrEmpty
	}
	rank := uint64(math.Ceil(q * float64(c.Count)))
	if rank < 1 {
		rank = 1
	}
	idx := make([]int, 0, len(c.Hist))
	for i := range c.Hist {
		idx = append(idx, i)
	}
	sort.Ints(idx)
	var cum uint64
	for _, i := range idx {
		cum += c.Hist[i]
		if cum >= rank {
			_, hi := contract.BucketBounds(i)
			if hi > c.Max {
				hi = c.Max
			}
			return hi, nil
		}
	}
	return c.Max, nil
}
