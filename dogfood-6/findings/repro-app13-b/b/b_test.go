package b

import "testing"

/** @id TEST-FB-001 @verifies REQ-FB-001 */
func TestTEST_FB_001_run(t *testing.T) {
	if Run() != 1 {
		t.Fatal("x")
	}
}
