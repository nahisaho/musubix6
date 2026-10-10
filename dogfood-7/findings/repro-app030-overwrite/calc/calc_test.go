package calc_test

import (
	"testing"
	"example.org/stubproof/calc"
)

// @id TEST-STUBPROOF-001 @verifies REQ-STUBPROOF-001
func TestTEST_STUBPROOF_001_Add(t *testing.T) {
	if calc.Add(2,3)!=5 { t.Fatal("sum") }
}
