package pipeline

import (
	"context"
	"example.org/observability/sampling"
	"example.org/observability/trace"
	"sync"
	"testing"
	"time"
)

// @id TEST-PIPE-001 @verifies REQ-PIPE-001 REQ-PIPE-002 REQ-PIPE-003 REQ-PIPE-004 REQ-PIPE-005 REQ-PIPE-006 REQ-PIPE-007 REQ-PIPE-008
func TestTEST_PIPE_001_Integration(t *testing.T) {
	now := time.Unix(100, 0)
	c, _ := trace.Parse("00-0123456789abcdef0123456789abcdef-0123456789abcdef-01")
	s := sampling.Span{Context: c, Duration: 123 * time.Millisecond, Error: true}
	p := New(2, time.Second, time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if p.Add(ctx, s, now) == nil || p.Metrics().Count != 0 || len(p.Logs()) != 0 {
		t.Fatal("canceled accepted")
	}
	bad := s
	bad.TraceID = [16]byte{}
	if p.Add(context.Background(), bad, now) == nil {
		t.Fatal("zero identity")
	}
	bad = s
	bad.Duration = -1
	if p.Add(context.Background(), bad, now) == nil {
		t.Fatal("negative latency")
	}
	if err := p.Add(context.Background(), s, now); err != nil {
		t.Fatal(err)
	}
	if p.Metrics().Count != 1 || p.Metrics().Sum != int64(s.Duration) || p.Logs()[0]["trace_id"] != "0123456789abcdef0123456789abcdef" {
		t.Fatal("missing aggregate")
	}
	ds := p.Flush(now.Add(time.Second))
	if len(ds) != 1 || !ds[0].Keep {
		t.Fatal("missing tail")
	}
	if err := p.Add(context.Background(), s, now); err != nil {
		t.Fatal(err)
	}
	if p.Add(context.Background(), s, now) == nil || p.Metrics().Count != 2 || len(p.Logs()) != 2 {
		t.Fatal("partial rejection")
	}
	p.Close()
	p.Close()
	if p.Add(context.Background(), s, now) == nil || p.Metrics().Count != 2 {
		t.Fatal("closed accepted")
	}
	con := New(64, time.Second, time.Second)
	var wg sync.WaitGroup
	for range 64 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := con.Add(context.Background(), s, now); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if con.Metrics().Count != 64 || len(con.Logs()) != 64 {
		t.Fatal("lost events")
	}
}
