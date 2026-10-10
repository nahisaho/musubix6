package pkg_test

import (
	"testing"
	"repro.overwrite/pkg"
)

// @id TEST-OVERWRITE-001 @verifies REQ-OVERWRITE-001
func TestTEST_OVERWRITE_001(t *testing.T) {
	if pkg.Missing() != 3 { t.Fatal("missing behavior") }
}
