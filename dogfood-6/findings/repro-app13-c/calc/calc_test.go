package calc

import "testing"

/** @id TEST-C-001 @verifies REQ-C-001 */
func TestTEST_C_001_add(t *testing.T) {
	if Add(2, 3) != 5 {
		t.Fatal("bad")
	}
}

func mk() *Calc { return New() }

/** @id TEST-C-002 @verifies REQ-C-002 */
func TestTEST_C_002_mul(t *testing.T) {
	c := New()
	if c.Mul(2, 3) != 6 {
		t.Fatal("bad")
	}
}
