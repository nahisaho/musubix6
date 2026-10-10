//go:build contract

package trace_test

import (
	"example.org/observability/trace"
	"testing"
)

// @id TEST-TRACE-002 @verifies REQ-TRACE-009
func TestTEST_TRACE_002_ContractShape(t *testing.T) {
	var c trace.Context
	if len(c.TraceID) != 16 || len(c.SpanID) != 8 {
		t.Fatal("public identity shape changed")
	}
}
