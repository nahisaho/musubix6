package logging

import (
	"context"
	"testing"
)

// @id TEST-LOG-002 @verifies REQ-LOG-009
func TestTEST_LOG_002_UntrustedIdentity(t *testing.T) {
	l := New(1)
	l.Write(context.Background(), "info", "plain", map[string]string{"trace_id": "spoof", "span_id": "spoof"})
	r := l.Records()[0]
	if _, ok := r["trace_id"]; ok {
		t.Fatal("untrusted trace retained")
	}
	if _, ok := r["span_id"]; ok {
		t.Fatal("untrusted span retained")
	}
}
