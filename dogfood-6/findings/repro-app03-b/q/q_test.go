package q

import "testing"

/** @id TEST-Q-001 @verifies REQ-Q-001 */
func TestTEST_Q_001_len(t *testing.T) {
	x := New()
	if x.Len() != 0 {
		t.Fatal("empty")
	}
}
