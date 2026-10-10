package rollup

import (
	"errors"
	"math"
	"reflect"
	"sync"
	"testing"

	"example.com/metrics/contract"
	"example.com/metrics/ingest"
)

func testCfg(maxSeries int) *contract.Config {
	return &contract.Config{
		BucketSubBits: 3, MaxBucketIndex: 495,
		Tiers:  []contract.Tier{{Name: "1m", Seconds: 60}, {Name: "5m", Seconds: 300}, {Name: "1h", Seconds: 3600}},
		Limits: contract.Limits{MaxSeries: maxSeries},
	}
}

func pt(name string, v uint64, ts int64) ingest.Point {
	return ingest.Point{Name: name, Value: v, TS: ts}
}

func mustAdd(t *testing.T, e *Engine, p ingest.Point) {
	t.Helper()
	if err := e.Add(p); err != nil {
		t.Fatalf("Add(%v): %v", p, err)
	}
}

// @id TEST-ROLLUP-001
// @verifies REQ-ROLLUP-001
func TestTEST_ROLLUP_001_cell_update(t *testing.T) {
	e := New(testCfg(10), Options{})
	mustAdd(t, e, pt("m", 1, 120))
	mustAdd(t, e, pt("m", 5, 130))
	mustAdd(t, e, pt("m", 100, 150))
	c, ok := e.Get(ingest.SeriesKey(pt("m", 0, 0)), 0, 120)
	if !ok {
		t.Fatal("cell missing")
	}
	want := map[int]uint64{}
	for _, v := range []uint64{1, 5, 100} {
		want[contract.BucketIndex(v)]++
	}
	if c.Count != 3 || c.Sum != 106 || c.Min != 1 || c.Max != 100 || !reflect.DeepEqual(c.Hist, want) {
		t.Fatalf("cell = %+v, want count 3 sum 106 min 1 max 100 hist %v", c, want)
	}
}

// @id TEST-ROLLUP-002
// @verifies REQ-ROLLUP-002
func TestTEST_ROLLUP_002_align(t *testing.T) {
	cases := []struct{ ts, secs, want int64 }{
		{0, 60, 0}, {59, 60, 0}, {60, 60, 60}, {119, 60, 60},
		{-1, 60, -60}, {-60, 60, -60}, {-61, 60, -120}, {3599, 3600, 0},
	}
	for _, c := range cases {
		if got := Align(c.ts, c.secs); got != c.want {
			t.Fatalf("Align(%d,%d) = %d, want %d", c.ts, c.secs, got, c.want)
		}
	}
}

// @id TEST-ROLLUP-003
// @verifies REQ-ROLLUP-003
func TestTEST_ROLLUP_003_cardinality(t *testing.T) {
	e := New(testCfg(3), Options{})
	for _, n := range []string{"m1", "m2", "m3"} {
		mustAdd(t, e, pt(n, 1, 10))
	}
	if err := e.Add(pt("m4", 1, 10)); !errors.Is(err, ErrCardinality) {
		t.Fatalf("m4: %v, want ErrCardinality", err)
	}
	mustAdd(t, e, pt("m1", 2, 20))
	if c, _ := e.Get(ingest.SeriesKey(pt("m1", 0, 0)), 0, 0); c.Count != 2 {
		t.Fatalf("m1 count = %d, want 2", c.Count)
	}
}

// @id TEST-ROLLUP-004
// @verifies REQ-ROLLUP-004
func TestTEST_ROLLUP_004_roll_idempotent(t *testing.T) {
	e := New(testCfg(10), Options{})
	for ts := int64(0); ts < 300; ts += 30 {
		mustAdd(t, e, pt("m", 3, ts))
	}
	key := ingest.SeriesKey(pt("m", 0, 0))
	e.Roll()
	if _, ok := e.Get(key, 1, 0); ok {
		t.Fatal("parent rolled before its end <= watermark")
	}
	mustAdd(t, e, pt("m", 3, 300))
	e.Roll()
	p, ok := e.Get(key, 1, 0)
	if !ok || p.Count != 10 {
		t.Fatalf("parent = %+v ok=%v, want count 10", p, ok)
	}
	first := e.Snapshot()
	e.Roll()
	e.Roll()
	if !reflect.DeepEqual(first, e.Snapshot()) {
		t.Fatal("Roll is not idempotent")
	}
}

// @id TEST-ROLLUP-005
// @verifies REQ-ROLLUP-005
func TestTEST_ROLLUP_005_conservation(t *testing.T) {
	e := New(testCfg(10), Options{})
	x := uint64(7)
	for ts := int64(0); ts < 7200; ts += 17 {
		x = x*6364136223846793005 + 1442695040888963407
		mustAdd(t, e, pt("m", x>>40, ts))
	}
	mustAdd(t, e, pt("m", 1, 8000))
	e.Roll()
	secs := []int64{60, 300, 3600}
	type k struct {
		t int
		s int64
	}
	sums := map[k]*Cell{}
	snap := e.Snapshot()
	for _, en := range snap {
		if en.Tier == 0 || en.Tier == 1 {
			kk := k{en.Tier + 1, Align(en.Start, secs[en.Tier+1])}
			if sums[kk] == nil {
				sums[kk] = &Cell{Hist: map[int]uint64{}}
			}
			a := sums[kk]
			a.Count += en.Cell.Count
			a.Sum += en.Cell.Sum
			for i, n := range en.Cell.Hist {
				a.Hist[i] += n
			}
		}
	}
	checked := 0
	for _, en := range snap {
		if en.Tier == 0 || !en.Cell.Rolled && en.Tier != 2 && en.Start+secs[en.Tier] > 8000 {
			continue
		}
		a := sums[k{en.Tier, en.Start}]
		if a == nil {
			t.Fatalf("no children for %+v", en)
		}
		if en.Tier == 2 && en.Start+3600 > 8000 {
			continue
		}
		checked++
		if a.Count != en.Cell.Count || a.Sum != en.Cell.Sum || !reflect.DeepEqual(a.Hist, en.Cell.Hist) {
			t.Fatalf("tier %d start %d not conserved: parent %+v children %+v", en.Tier, en.Start, en.Cell, a)
		}
	}
	if checked < 10 {
		t.Fatalf("only %d parents checked", checked)
	}
}

// @id TEST-ROLLUP-006
// @verifies REQ-ROLLUP-006
func TestTEST_ROLLUP_006_saturation(t *testing.T) {
	e := New(testCfg(10), Options{})
	key := ingest.SeriesKey(pt("m", 0, 0))
	mustAdd(t, e, pt("m", math.MaxUint64, 10))
	if c, _ := e.Get(key, 0, 0); c.Saturated || c.Sum != math.MaxUint64 {
		t.Fatalf("exact max must not saturate: %+v", c)
	}
	mustAdd(t, e, pt("m", 5, 20))
	c, _ := e.Get(key, 0, 0)
	if !c.Saturated || c.Sum != math.MaxUint64 || c.Count != 2 {
		t.Fatalf("cell = %+v, want saturated sum, count 2", c)
	}
	mustAdd(t, e, pt("m", 1, 400))
	e.Roll()
	p, ok := e.Get(key, 1, 0)
	if !ok || !p.Saturated || p.Sum != math.MaxUint64 {
		t.Fatalf("parent = %+v ok=%v, want saturated", p, ok)
	}
	mustAdd(t, e, pt("m", 1, 30))
	if c, _ := e.Get(key, 0, 0); !c.Saturated {
		t.Fatal("Saturated must be sticky")
	}
}

// @id TEST-ROLLUP-007
// @verifies REQ-ROLLUP-007
func TestTEST_ROLLUP_007_quantile(t *testing.T) {
	e := New(testCfg(10), Options{})
	for v := uint64(1); v <= 100; v++ {
		mustAdd(t, e, pt("m", v, 5))
	}
	c, _ := e.Get(ingest.SeriesKey(pt("m", 0, 0)), 0, 0)
	for _, w := range []struct {
		q    float64
		want uint64
	}{{0.5, 51}, {1, 100}, {0.99, 100}, {0, 1}} {
		got, err := Quantile(c, w.q)
		if err != nil || got != w.want {
			t.Fatalf("Quantile(%v) = %d, %v; want %d", w.q, got, err, w.want)
		}
	}
	if _, err := Quantile(Cell{}, 0.5); !errors.Is(err, ErrEmpty) {
		t.Fatalf("empty: %v", err)
	}
	for _, q := range []float64{-0.1, 1.1, math.NaN()} {
		if _, err := Quantile(c, q); !errors.Is(err, ErrQuantile) {
			t.Fatalf("q=%v: %v, want ErrQuantile", q, err)
		}
	}
}

// @id TEST-ROLLUP-008
// @verifies REQ-ROLLUP-008
func TestTEST_ROLLUP_008_late_amend(t *testing.T) {
	e := New(testCfg(10), Options{})
	key := ingest.SeriesKey(pt("m", 0, 0))
	mustAdd(t, e, pt("m", 3, 10))
	mustAdd(t, e, pt("m", 1, 600))
	e.Roll()
	mustAdd(t, e, pt("m", 7, 20))
	c, _ := e.Get(key, 0, 0)
	p, ok := e.Get(key, 1, 0)
	if c.Count != 2 || !ok || p.Count != 2 || p.Sum != 10 || p.Max != 7 {
		t.Fatalf("child %+v parent %+v ok=%v", c, p, ok)
	}
	before := e.Snapshot()
	if err := e.Add(pt("m", 9, -1000)); !errors.Is(err, ErrLate) {
		t.Fatalf("orphan late point: %v, want ErrLate", err)
	}
	if !reflect.DeepEqual(before, e.Snapshot()) {
		t.Fatal("ErrLate must not mutate")
	}
}

// @id TEST-ROLLUP-009
// @verifies REQ-ROLLUP-009
func TestTEST_ROLLUP_009_evict(t *testing.T) {
	e := New(testCfg(3), Options{Retention: []int64{120, 300, 600}})
	mustAdd(t, e, pt("m", 1, 0))
	mustAdd(t, e, pt("m", 1, 4000))
	e.Roll()
	if n := e.Evict(179); n != 0 {
		t.Fatalf("Evict(179) = %d, want 0", n)
	}
	if n := e.Evict(180); n != 1 {
		t.Fatalf("Evict(180) = %d, want 1 (unrolled cell must be kept)", n)
	}
	if _, ok := e.Get(ingest.SeriesKey(pt("m", 0, 0)), 0, 3960); !ok {
		t.Fatal("unrolled cell evicted")
	}

	e = New(testCfg(3), Options{Retention: []int64{1, 1, 1}})
	for _, n := range []string{"a", "b", "c"} {
		mustAdd(t, e, pt(n, 1, 0))
	}
	mustAdd(t, e, pt("c", 1, 7200))
	e.Roll()
	if n := e.Evict(1 << 40); n != 9 {
		t.Fatalf("Evict = %d, want 9", n)
	}
	mustAdd(t, e, pt("d", 1, 7300))
	mustAdd(t, e, pt("e", 1, 7300))
	if err := e.Add(pt("f", 1, 7300)); !errors.Is(err, ErrCardinality) {
		t.Fatalf("f: %v, want ErrCardinality", err)
	}
}

// @id TEST-ROLLUP-010
// @verifies REQ-ROLLUP-010
func TestTEST_ROLLUP_010_snapshot_order(t *testing.T) {
	pts := []ingest.Point{pt("b", 1, 70), pt("a", 2, 130), pt("b", 3, 10), pt("a", 4, 5), pt("c", 5, 400)}
	e1 := New(testCfg(10), Options{})
	e2 := New(testCfg(10), Options{})
	for _, p := range pts {
		mustAdd(t, e1, p)
	}
	for i := len(pts) - 1; i >= 0; i-- {
		mustAdd(t, e2, pts[i])
	}
	e1.Roll()
	e2.Roll()
	s1 := e1.Snapshot()
	if !reflect.DeepEqual(s1, e2.Snapshot()) || !reflect.DeepEqual(s1, e1.Snapshot()) {
		t.Fatal("Snapshot not deterministic")
	}
	for i := 1; i < len(s1); i++ {
		a, b := s1[i-1], s1[i]
		less := a.Series < b.Series || a.Series == b.Series && (a.Tier < b.Tier || a.Tier == b.Tier && a.Start < b.Start)
		if !less {
			t.Fatalf("entries %d,%d out of order: %v %v", i-1, i, a, b)
		}
	}
	for _, en := range s1 {
		if en.Cell.Count == 0 {
			t.Fatalf("empty cell listed: %+v", en)
		}
	}
}

// @id TEST-ROLLUP-011
// @verifies REQ-ROLLUP-011
func TestTEST_ROLLUP_011_concurrent(t *testing.T) {
	seq := New(testCfg(10), Options{})
	par := New(testCfg(10), Options{})
	var all []ingest.Point
	for g := 0; g < 8; g++ {
		for i := 0; i < 100; i++ {
			all = append(all, pt([]string{"x", "y"}[i%2], uint64(g*1000+i+1), int64(i*13+g)))
		}
	}
	for _, p := range all {
		mustAdd(t, seq, p)
	}
	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(part []ingest.Point) {
			defer wg.Done()
			for _, p := range part {
				if err := par.Add(p); err != nil {
					t.Error(err)
				}
			}
		}(all[g*100 : (g+1)*100])
	}
	wg.Wait()
	seq.Roll()
	par.Roll()
	if !reflect.DeepEqual(seq.Snapshot(), par.Snapshot()) {
		t.Fatal("concurrent result differs from sequential")
	}
}

// @id TEST-ROLLUP-012
// @verifies REQ-ROLLUP-012
func TestTEST_ROLLUP_012_series_isolation(t *testing.T) {
	e := New(testCfg(10), Options{})
	a := ingest.Point{Name: "m", Value: 1, TS: 10, Labels: []ingest.Label{{K: "h", V: "a"}}}
	b := ingest.Point{Name: "m", Value: 1000, TS: 10, Labels: []ingest.Label{{K: "h", V: "b"}}}
	mustAdd(t, e, a)
	mustAdd(t, e, b)
	mustAdd(t, e, pt("m", 50, 10))
	for _, c := range []struct {
		p   ingest.Point
		sum uint64
	}{{a, 1}, {b, 1000}, {pt("m", 0, 0), 50}} {
		cell, ok := e.Get(ingest.SeriesKey(c.p), 0, 0)
		if !ok || cell.Count != 1 || cell.Sum != c.sum {
			t.Fatalf("series %q cell = %+v", ingest.SeriesKey(c.p), cell)
		}
	}
}

// @id TEST-ROLLUP-013
// @verifies REQ-ROLLUP-013
func TestTEST_ROLLUP_013_range(t *testing.T) {
	e := New(testCfg(10), Options{})
	mustAdd(t, e, pt("m", 1, 100))
	before := e.Snapshot()
	for _, ts := range []int64{math.MaxInt64, math.MaxInt64 - 1807, math.MinInt64, math.MinInt64 + 59} {
		if err := e.Add(pt("m", 1, ts)); !errors.Is(err, ErrRange) {
			t.Fatalf("Add ts=%d: %v, want ErrRange", ts, err)
		}
	}
	if !reflect.DeepEqual(before, e.Snapshot()) {
		t.Fatal("ErrRange must not mutate")
	}
	mustAdd(t, e, pt("m", 1, math.MaxInt64-3600))
	mustAdd(t, e, pt("m", 1, math.MinInt64+3600))
}
