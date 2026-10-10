package logging

import (
	"context"
	"encoding/json"
	"example.org/observability/trace"
	"sync"
	"testing"
)

// @id TEST-LOG-001 @verifies REQ-LOG-001 REQ-LOG-002 REQ-LOG-003 REQ-LOG-004 REQ-LOG-005 REQ-LOG-006 REQ-LOG-007 REQ-LOG-008
func TestTEST_LOG_001_Correlation(t *testing.T) {
	c, _ := trace.Parse("00-0123456789abcdef0123456789abcdef-0123456789abcdef-01")
	ctx := trace.With(context.Background(), c)
	l := New(2)
	attrs := map[string]string{"region": "east", "message": "spoof", "trace_id": "spoof", "span_id": "spoof", "level": "spoof"}
	if err := l.Write(ctx, "info", "accepted", attrs); err != nil {
		t.Fatal(err)
	}
	attrs["region"] = "west"
	if len(l.Records()) != 1 {
		t.Fatal("missing log")
	}
	r := l.Records()[0]
	if r["trace_id"] != "0123456789abcdef0123456789abcdef" || r["span_id"] != "0123456789abcdef" || r["message"] != "accepted" || r["level"] != "info" || r["region"] != "east" {
		t.Fatal(r)
	}
	r["message"] = "changed"
	if l.Records()[0]["message"] != "accepted" {
		t.Fatal("snapshot alias")
	}
	if err := l.Write(context.Background(), "info", "plain", nil); err != nil {
		t.Fatal(err)
	}
	if _, ok := l.Records()[1]["trace_id"]; ok {
		t.Fatal("fabricated trace")
	}
	if l.Write(ctx, "info", "overflow", nil) == nil || len(l.Records()) != 2 {
		t.Fatal("capacity")
	}
	b, err := json.Marshal(l.Records()[0])
	if err != nil {
		t.Fatal(err)
	}
	var decoded Record
	if json.Unmarshal(b, &decoded) != nil || decoded["region"] != "east" {
		t.Fatal(string(b))
	}
	con := New(64)
	var wg sync.WaitGroup
	for range 64 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := con.Write(ctx, "info", "parallel", nil); err != nil {
				t.Error(err)
			}
			con.Records()
		}()
	}
	wg.Wait()
	if con.Len() != 64 {
		t.Fatal("lost logs")
	}
}
