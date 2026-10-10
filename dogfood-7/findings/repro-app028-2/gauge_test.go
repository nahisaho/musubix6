package versioned_test

import (
	rt "example.com/versioned/internal/runtimev1"
	"testing"
)

// @id TEST-GAUGE-001 @verifies REQ-GAUGE-001
func TestTEST_GAUGE_001_New(t *testing.T) {
	if rt.NewGauge().Value() != 2 {
		t.Fatal("gauge value")
	}
}
