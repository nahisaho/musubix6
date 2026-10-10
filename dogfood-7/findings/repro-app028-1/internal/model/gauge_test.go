package model

import "testing"

// @id TEST-BASE-001 @verifies REQ-BASE-001
func TestTEST_BASE_001_Value(t *testing.T) {
	if (&Gauge{}).Value() != 7 {
		t.Fatal("gauge value")
	}
}
