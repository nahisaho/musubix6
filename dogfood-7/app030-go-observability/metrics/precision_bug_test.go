package metrics

import "testing"

// @id TEST-METRIC-003 @verifies REQ-METRIC-011
func TestTEST_METRIC_003_PreciseMedian(t *testing.T) {
	h := New(1)
	s := h.Snapshot()
	s.Count = 9007199254740993
	s.Sum = 4503599627370497
	s.Counts[0] = 4503599627370496
	s.Counts[1] = 4503599627370497
	if err := h.Merge(s); err != nil {
		t.Fatal(err)
	}
	if got, err := h.Snapshot().Quantile(.5); err != nil || got != 1 {
		t.Fatalf("median=%d err=%v", got, err)
	}
}
