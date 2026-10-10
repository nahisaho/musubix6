package sampling

import (
	"example.org/observability/trace"
	"sync"
	"testing"
	"time"
)

func span(id byte, d time.Duration, bad bool) Span {
	var c trace.Context
	c.TraceID[15] = id
	c.SpanID[7] = 1
	return Span{Context: c, Duration: d, Error: bad}
}

// @id TEST-SAMPLE-001 @verifies REQ-SAMPLE-001 REQ-SAMPLE-002 REQ-SAMPLE-003 REQ-SAMPLE-004 REQ-SAMPLE-005 REQ-SAMPLE-006 REQ-SAMPLE-007 REQ-SAMPLE-008 REQ-SAMPLE-009
func TestTEST_SAMPLE_001_Tail(t *testing.T) {
	now := time.Unix(100, 0)
	bounded := New(2, time.Second, 1)
	bounded.Add(span(1, 1, false), now)
	bounded.Add(span(1, 1, false), now)
	if bounded.Add(span(1, 1, false), now) == nil {
		t.Fatal("unbounded trace")
	}
	if got := bounded.Flush(now.Add(time.Second)); len(got) != 1 || len(got[0].Spans) != 2 {
		t.Fatal("bound rejection mutated")
	}
	s := New(3, time.Second, 100*time.Millisecond)
	for _, v := range []Span{span(1, 1, false), span(1, 1, true), span(2, 100*time.Millisecond, false), span(3, 1, false)} {
		if err := s.Add(v, now); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Add(span(4, 1, false), now); err == nil {
		t.Fatal("capacity accepted")
	}
	if ds := s.Flush(now.Add(time.Second - time.Nanosecond)); len(ds) != 0 {
		t.Fatal("early decision")
	}
	ds := s.Flush(now.Add(time.Second))
	if len(ds) != 3 {
		t.Fatalf("decisions=%d", len(ds))
	}
	if !ds[0].Keep || len(ds[0].Spans) != 2 || !ds[1].Keep || ds[2].Keep {
		t.Fatal(ds)
	}
	if len(s.Flush(now.Add(time.Hour))) != 0 {
		t.Fatal("repeated decision")
	}
	if err := s.Add(span(4, 1, false), now); err != nil {
		t.Fatal("not freed")
	}
	con := New(128, time.Second, 1)
	var wg sync.WaitGroup
	for i := byte(1); i <= 64; i++ {
		wg.Add(1)
		go func(id byte) {
			defer wg.Done()
			if err := con.Add(span(id, 1, false), now); err != nil {
				t.Error(err)
			}
			con.Flush(now)
		}(i)
	}
	wg.Wait()
	if len(con.Flush(now.Add(time.Second))) != 64 {
		t.Fatal("lost concurrent traces")
	}
}
