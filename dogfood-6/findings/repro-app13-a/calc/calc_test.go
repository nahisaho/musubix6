package calc_test

import (
	"testing"

	"example.com/r/calc"
)

type rig struct{ c *calc.Calc }

/** @id TEST-C-001 @verifies REQ-C-001 */
func TestTEST_C_001_add(t *testing.T) {
	r := &rig{c: calc.New(1)}
	m := calc.Msg{From: 1, To: 2}
	if r.c.Add(2, 3) != 5 || m.From != 1 {
		t.Fatal("bad")
	}
}
