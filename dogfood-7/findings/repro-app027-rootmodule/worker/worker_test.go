package worker

import "testing"

// @id TEST-WORKER-001 @verifies REQ-WORKER-001
func TestTEST_WORKER_001_Sum(t *testing.T) {
	if Sum(2, 3) != 5 { t.Fatal("sum") }
}
