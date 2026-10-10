package metrics

import (
	"math"
	"sync"
	"testing"
)

// @id TEST-METRIC-001 @verifies REQ-METRIC-001 REQ-METRIC-002 REQ-METRIC-003 REQ-METRIC-004 REQ-METRIC-005 REQ-METRIC-006 REQ-METRIC-007 REQ-METRIC-008 REQ-METRIC-009
func TestTEST_METRIC_001_HDR(t *testing.T) {
	h := New(1_000_000_000)
	overflow := New(1)
	saturated := overflow.Snapshot()
	saturated.Count = math.MaxInt64
	saturated.Sum = math.MaxInt64
	if len(saturated.Counts) > 1 {
		saturated.Counts[1] = math.MaxInt64
	}
	if err := overflow.Merge(saturated); err != nil {
		t.Fatal(err)
	}
	if overflow.Record(1) == nil || overflow.Merge(saturated) == nil || overflow.Snapshot().Count != math.MaxInt64 {
		t.Fatal("overflow")
	}
	for _, v := range []int64{0, 1, 1023, 1024, 2048, 123456, 1_000_000_000} {
		if err := h.Record(v); err != nil {
			t.Fatal(err)
		}
	}
	s := h.Snapshot()
	if s.Count != 7 || s.Sum != 1_000_127_552 {
		t.Fatalf("totals=%d/%d", s.Count, s.Sum)
	}
	for _, v := range []int64{1, 1023, 1024, 2048, 123456, 999999999} {
		one := New(1_000_000_000)
		one.Record(v)
		got, err := one.Snapshot().Quantile(.99)
		if err != nil || got < v || float64(got-v) > float64(v)*.001 {
			t.Errorf("quantile %d -> %d (%v)", v, got, err)
		}
	}
	if h.Record(-1) == nil || h.Record(1_000_000_001) == nil || h.Snapshot().Count != 7 {
		t.Fatal("bad range mutation")
	}
	if z, err := New(10).Snapshot().Quantile(.5); err != nil || z != 0 {
		t.Fatal(z, err)
	}
	for _, q := range []float64{-1, 1.1, math.NaN()} {
		if _, err := s.Quantile(q); err == nil {
			t.Fatal("bad quantile")
		}
	}
	copy := New(1_000_000_000)
	if err := copy.Merge(s); err != nil {
		t.Fatal(err)
	}
	s.Counts[0] = 999
	if copy.Snapshot().Count != 7 || copy.Snapshot().Counts[0] == 999 {
		t.Fatal("merge alias")
	}
	if copy.Merge(New(10).Snapshot()) == nil || copy.Snapshot().Count != 7 {
		t.Fatal("incompatible merge")
	}
	var wg sync.WaitGroup
	con := New(100)
	for range 16 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 100 {
				con.Record(10)
				con.Snapshot()
			}
		}()
	}
	wg.Wait()
	if con.Snapshot().Count != 1600 || con.Snapshot().Sum != 16000 {
		t.Fatal("lost records")
	}
}
