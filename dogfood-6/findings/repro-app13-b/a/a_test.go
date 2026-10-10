package a

import "testing"

/** @id TEST-FA-001 @verifies REQ-FA-001 */
func TestTEST_FA_001_m(t *testing.T) {
	if New().M() != 1 {
		t.Fatal("x")
	}
}
