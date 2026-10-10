package queue_test

import (
	"dogfood.local/controller/internal/clock"
	"dogfood.local/controller/internal/queue"
	"testing"
	"time"
)

// @id TEST-QUEUE-001
// @verifies REQ-QUEUE-001 REQ-QUEUE-002 REQ-QUEUE-003
func TestTEST_QUEUE_001_fifo(t *testing.T) {
	q := queue.New[string](clock.NewFake(), time.Second, 8*time.Second)
	q.Add("a")
	q.Add("a")
	q.Add("b")
	a, ok := q.Get()
	if !ok || a != "a" {
		t.Fatal("first key")
	}
	b, ok := q.Get()
	if !ok || b != "b" {
		t.Fatal("second key")
	}
	if _, ok := q.Get(); ok {
		t.Fatal("duplicate processing key delivered")
	}
}

// @id TEST-QUEUE-004
// @verifies REQ-QUEUE-010
func TestTEST_QUEUE_004_cancel_delayed(t *testing.T) {
	cl := clock.NewFake()
	q := queue.New[string](cl, time.Second, 8*time.Second)
	q.AddRateLimited("a")
	q.Add("a")
	if _, ok := q.Get(); !ok {
		t.Fatal("fresh event missing")
	}
	q.Forget("a")
	q.Done("a")
	cl.Advance(time.Second)
	q.Tick()
	if _, ok := q.Get(); ok {
		t.Fatal("forgotten retry resurrected work")
	}
	if q.NumRequeues("a") != 0 {
		t.Fatal("retry count retained")
	}
}

// @id TEST-QUEUE-002
// @verifies REQ-QUEUE-004 REQ-QUEUE-005 REQ-QUEUE-006
func TestTEST_QUEUE_002_backoff(t *testing.T) {
	c := clock.NewFake()
	q := queue.New[string](c, time.Second, 4*time.Second)
	q.Add("a")
	q.Get()
	q.Add("a")
	q.Add("a")
	q.Done("a")
	if key, ok := q.Get(); !ok || key != "a" {
		t.Fatal("dirty key lost")
	}
	if _, ok := q.Get(); ok {
		t.Fatal("dirty duplicate")
	}
	q.Done("a")
	for i, want := range []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 4 * time.Second} {
		t.Run(string(rune('0'+i)), func(t *testing.T) {
			if got := q.AddRateLimited("retry"); got != want {
				t.Fatalf("delay %v want %v", got, want)
			}
			q.Tick()
			if _, ok := q.Get(); ok {
				t.Fatal("early retry")
			}
			c.Advance(want)
			q.Tick()
			if key, ok := q.Get(); !ok || key != "retry" {
				t.Fatal("deadline retry lost")
			}
			q.Done("retry")
		})
	}
}

// @id TEST-QUEUE-003
// @verifies REQ-QUEUE-007 REQ-QUEUE-008 REQ-QUEUE-009
func TestTEST_QUEUE_003_clock_shutdown(t *testing.T) {
	c := clock.NewFake()
	q := queue.New[int](c, time.Second, 4*time.Second)
	q.AddRateLimited(7)
	if q.NumRequeues(7) != 1 {
		t.Fatal("retry count")
	}
	c.Advance(time.Second - time.Nanosecond)
	q.Tick()
	if _, ok := q.Get(); ok {
		t.Fatal("early clock")
	}
	c.Advance(time.Nanosecond)
	q.Tick()
	if k, ok := q.Get(); !ok || k != 7 {
		t.Fatal("exact deadline")
	}
	q.Done(7)
	q.Forget(7)
	if q.NumRequeues(7) != 0 {
		t.Fatal("forget failed")
	}
	q.ShutDown()
	q.Add(8)
	q.AddRateLimited(9)
	c.Advance(time.Hour)
	q.Tick()
	if _, ok := q.Get(); ok {
		t.Fatal("shutdown allowed work")
	}
}
