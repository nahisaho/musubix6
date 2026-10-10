package counter

import "testing"

// @id TEST-LIB-001
// @verifies REQ-LIB-001
func TestTEST_LIB_001_add(t *testing.T) {
	if Add(1, 2) != 3 { t.Fatal("sum") }
}
