package core

import "testing"

// @id TEST-CORE-001 @verifies REQ-CORE-001
func TestTEST_CORE_001_Add(t *testing.T) {
	if Add(2, 3) != 5 { t.Fatal("addition") }
}
