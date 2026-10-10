package metrics

import (
	"errors"
	"example.org/observability/internal/hdr"
	"math"
	"sync"
)

var ErrRange = errors.New("histogram value or quantile out of range")
var ErrSnapshot = errors.New("invalid or incompatible histogram snapshot")
var ErrOverflow = errors.New("histogram overflow")

type Snapshot struct {
	Max        int64
	Count, Sum int64
	Counts     []int64
}
type Histogram struct {
	mu   sync.Mutex
	data Snapshot
}

// @id CODE-METRIC-001 @implements REQ-METRIC-001 REQ-METRIC-002 REQ-METRIC-003 REQ-METRIC-004 REQ-METRIC-005 REQ-METRIC-006 REQ-METRIC-007 REQ-METRIC-008 REQ-METRIC-009
func New(maxValue int64) *Histogram {
	if maxValue < 1 || maxValue > 1e12 {
		panic("invalid histogram maximum")
	}
	return &Histogram{data: Snapshot{Max: maxValue, Counts: make([]int64, hdr.Index(maxValue)+1)}}
}
func (h *Histogram) Record(value int64) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if value < 0 || value > h.data.Max {
		return ErrRange
	}
	if h.data.Count == math.MaxInt64 || h.data.Sum > math.MaxInt64-value {
		return ErrOverflow
	}
	h.data.Count++
	h.data.Sum += value
	h.data.Counts[hdr.Index(value)]++
	return nil
}
func (h *Histogram) Snapshot() Snapshot {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := h.data
	out.Counts = append([]int64(nil), h.data.Counts...)
	return out
}
func (h *Histogram) Merge(s Snapshot) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s.Max != h.data.Max || len(s.Counts) != len(h.data.Counts) || s.Count < 0 || s.Sum < 0 {
		return ErrSnapshot
	}
	var total int64
	for _, n := range s.Counts {
		if n < 0 || total > math.MaxInt64-n {
			return ErrSnapshot
		}
		total += n
	}
	if total != s.Count {
		return ErrSnapshot
	}
	if h.data.Count > math.MaxInt64-s.Count || h.data.Sum > math.MaxInt64-s.Sum {
		return ErrOverflow
	}
	for i, n := range s.Counts {
		h.data.Counts[i] += n
	}
	h.data.Count += s.Count
	h.data.Sum += s.Sum
	return nil
}

// @id CODE-METRIC-003 @implements REQ-METRIC-010 REQ-METRIC-011
func (s Snapshot) Quantile(q float64) (int64, error) {
	if math.IsNaN(q) || q < 0 || q > 1 {
		return 0, ErrRange
	}
	if s.Count == 0 {
		return 0, nil
	}
	rank := hdr.Rank(s.Count, q)
	var seen int64
	for i, n := range s.Counts {
		seen += n
		if seen >= rank {
			return min(s.Max, hdr.Upper(i)), nil
		}
	}
	return 0, ErrSnapshot
}
