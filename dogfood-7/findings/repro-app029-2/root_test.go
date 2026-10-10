package rootmodule

import "testing"

// @id TEST-MODULE-001 @verifies REQ-MODULE-001
func TestTEST_MODULE_001(t *testing.T) {
	if Keep()!=77 { t.Fatal("root contract") }
}
