package window_test

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"example.com/rl/window"
)

type clk struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clk) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}
func (c *clk) Advance(d time.Duration) { c.mu.Lock(); c.t = c.t.Add(d); c.mu.Unlock() }
func newClk() *clk                     { return &clk{t: time.Unix(5000, 0)} }

/** @id TEST-WINDOW-001 @verifies REQ-WINDOW-001 */
func TestTEST_WINDOW_001_invalid(t *testing.T) {
	if _, err := window.New(0, time.Second, time.Now); !errors.Is(err, window.ErrInvalidConfig) {
		t.Fatalf("limit 0: %v", err)
	}
	if _, err := window.New(1, 0, time.Now); !errors.Is(err, window.ErrInvalidConfig) {
		t.Fatalf("window 0: %v", err)
	}
}

/** @id TEST-WINDOW-002 @verifies REQ-WINDOW-002 */
func TestTEST_WINDOW_002_limit(t *testing.T) {
	c := newClk()
	w, _ := window.New(2, time.Second, c.Now)
	if !w.Allow() || !w.Allow() {
		t.Fatal("first two admitted")
	}
	if w.Allow() {
		t.Fatal("third rejected")
	}
}

/** @id TEST-WINDOW-003 @verifies REQ-WINDOW-003 */
func TestTEST_WINDOW_003_evict(t *testing.T) {
	c := newClk()
	w, _ := window.New(1, time.Second, c.Now)
	w.Allow()
	c.Advance(1500 * time.Millisecond)
	if !w.Allow() {
		t.Fatal("old event must stop counting")
	}
}

/** @id TEST-WINDOW-004 @verifies REQ-WINDOW-004 */
func TestTEST_WINDOW_004_remaining(t *testing.T) {
	c := newClk()
	w, _ := window.New(3, time.Second, c.Now)
	if w.Remaining() != 3 {
		t.Fatal("3 initially")
	}
	w.Allow()
	if w.Remaining() != 2 {
		t.Fatal("2 after one")
	}
	c.Advance(2 * time.Second)
	if w.Remaining() != 3 {
		t.Fatal("3 after expiry")
	}
}

/** @id TEST-WINDOW-005 @verifies REQ-WINDOW-005 */
func TestTEST_WINDOW_005_concurrent(t *testing.T) {
	c := newClk()
	w, _ := window.New(30, time.Second, c.Now)
	var n int64
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if w.Allow() {
				atomic.AddInt64(&n, 1)
			}
		}()
	}
	wg.Wait()
	if n != 30 {
		t.Fatalf("admitted %d want 30", n)
	}
}

/** @id TEST-WINDOW-006 @verifies REQ-WINDOW-006 */
func TestTEST_WINDOW_006_reset(t *testing.T) {
	c := newClk()
	w, _ := window.New(1, time.Second, c.Now)
	w.Allow()
	w.Reset()
	if !w.Allow() {
		t.Fatal("after reset admitted")
	}
}

/** @id TEST-WINDOW-007 @verifies REQ-WINDOW-007 */
func TestTEST_WINDOW_007_boundaryExpires(t *testing.T) {
	c := newClk()
	w, _ := window.New(1, time.Second, c.Now)
	w.Allow()
	c.Advance(time.Second)
	if !w.Allow() {
		t.Fatal("event exactly one window old must be expired")
	}
}
