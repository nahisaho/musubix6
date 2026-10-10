package trace_test

import (
	"context"
	"example.org/observability/trace"
	"net/http"
	"strings"
	"testing"
)

const header = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01"

// @id TEST-TRACE-001 @verifies REQ-TRACE-001 REQ-TRACE-002 REQ-TRACE-003 REQ-TRACE-004 REQ-TRACE-005 REQ-TRACE-006 REQ-TRACE-007 REQ-TRACE-008
func TestTEST_TRACE_001_Propagation(t *testing.T) {
	t.Run("parse-roundtrip", func(t *testing.T) {
		c, err := trace.Parse(header)
		if err != nil || c.String() != header || c.Flags != 1 {
			t.Fatalf("parse: %v %v", c, err)
		}
	})
	t.Run("invalid-table", func(t *testing.T) {
		for _, h := range []string{"", header[:54], "01" + header[2:], strings.ToUpper(header), strings.Replace(header, "0123456789abcdef0123456789abcdef", strings.Repeat("0", 32), 1), strings.Replace(header, "-0123456789abcdef-", "-"+strings.Repeat("0", 16)+"-", 1), strings.Replace(header, "-", "_", 1), header[:53] + "zz"} {
			if _, err := trace.Parse(h); err == nil {
				t.Errorf("accepted %q", h)
			}
		}
	})
	t.Run("context-and-headers", func(t *testing.T) {
		c, _ := trace.Parse(header)
		parent, cancel := context.WithCancel(context.WithValue(context.Background(), "sentinel", 7))
		ctx := trace.With(parent, c)
		got, ok := trace.From(ctx)
		if !ok || got != c || ctx.Value("sentinel") != 7 {
			t.Fatal("value lost")
		}
		cancel()
		if ctx.Err() != context.Canceled {
			t.Fatal("cancel lost")
		}
		if _, ok := trace.From(context.Background()); ok {
			t.Fatal("fabricated")
		}
		h := http.Header{}
		trace.Inject(ctx, h)
		if h.Get("traceparent") != header {
			t.Fatal(h)
		}
		extracted, err := trace.Extract(parent, h)
		if c2, ok := trace.From(extracted); err != nil || !ok || c2 != c {
			t.Fatal("extract")
		}
		h.Set("traceparent", "bad")
		if same, err := trace.Extract(parent, h); err == nil || same != parent {
			t.Fatal("bad extraction changed parent")
		}
	})
	t.Run("child", func(t *testing.T) {
		c, _ := trace.Parse(header)
		var span [8]byte
		span[7] = 2
		child, err := c.Child(span)
		if err != nil || child.TraceID != c.TraceID || child.Flags != c.Flags || child.SpanID != span {
			t.Fatal("child")
		}
		if _, err := c.Child([8]byte{}); err == nil {
			t.Fatal("zero child")
		}
	})
}
