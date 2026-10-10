package calc_test

import (
	"testing"

	"example.com/r/calc"
)

/** @id TEST-C-001 @verifies REQ-C-001 */
func TestTEST_C_001_x(t *testing.T) {
	c, err := calc.New(1, 3)
	if err != nil {
		t.Fatal(err)
	}
	if !c.Allow() {
		t.Fatal("no")
	}
}
