package metrics

import (
	"math"
	"testing"
)

// @id TEST-METRIC-002 @verifies REQ-METRIC-010
func TestTEST_METRIC_002_MaxCountQuantile(t *testing.T) {
	h := New(1)
	s := h.Snapshot()
	s.Count = math.MaxInt64
	s.Sum = math.MaxInt64 - 1
	s.Counts[0] = 1
	s.Counts[1] = math.MaxInt64 - 1
	if err := h.Merge(s); err != nil {
		t.Fatal(err)
	}
	got, err := h.Snapshot().Quantile(1)
	if err != nil || got != 1 {
		t.Fatalf("highest bucket=%d err=%v", got, err)
	}
}
