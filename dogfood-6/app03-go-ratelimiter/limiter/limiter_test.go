package limiter_test

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"example.com/rl/bucket"
	"example.com/rl/limiter"
	"example.com/rl/window"
)

type clk struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clk) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *clk) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

func bucketFactory(c *clk, burst float64) func() limiter.Limiter {
	return func() limiter.Limiter {
		b, _ := bucket.New(1, burst, c.Now)
		return b
	}
}

/** @id TEST-LIMITER-001 @verifies REQ-LIMITER-001 */
func TestTEST_LIMITER_001_factoryPerKey(t *testing.T) {
	c := &clk{t: time.Unix(1, 0)}
	var made int32
	r := limiter.NewRegistry(func() limiter.Limiter {
		atomic.AddInt32(&made, 1)
		b, _ := bucket.New(1, 1, c.Now)
		return b
	}, c.Now)
	if !r.Allow("a") {
		t.Fatal("first allowed")
	}
	if r.Allow("a") {
		t.Fatal("second denied")
	}
	if made != 1 {
		t.Fatalf("factory called %d times", made)
	}
}

/** @id TEST-LIMITER-002 @verifies REQ-LIMITER-002 */
func TestTEST_LIMITER_002_keysIndependent(t *testing.T) {
	c := &clk{t: time.Unix(1, 0)}
	r := limiter.NewRegistry(bucketFactory(c, 1), c.Now)
	if !r.Allow("a") || !r.Allow("b") {
		t.Fatal("each key has its own budget")
	}
	if r.Allow("a") || r.Allow("b") {
		t.Fatal("both exhausted")
	}
}

/** @id TEST-LIMITER-003 @verifies REQ-LIMITER-003 */
func TestTEST_LIMITER_003_compositeAnd(t *testing.T) {
	c := &clk{t: time.Unix(1, 0)}
	b, _ := bucket.New(1, 5, c.Now)
	w, _ := window.New(2, time.Minute, c.Now)
	comp := limiter.NewComposite(b, w)
	if !comp.Allow() || !comp.Allow() {
		t.Fatal("two allowed")
	}
	if comp.Allow() {
		t.Fatal("window must veto third")
	}
	b2, _ := bucket.New(1, 1, c.Now)
	w2, _ := window.New(5, time.Minute, c.Now)
	comp2 := limiter.NewComposite(b2, w2)
	comp2.Allow()
	if comp2.Allow() {
		t.Fatal("bucket must veto second")
	}
}

/** @id TEST-LIMITER-004 @verifies REQ-LIMITER-004 */
func TestTEST_LIMITER_004_refundOnWindowReject(t *testing.T) {
	c := &clk{t: time.Unix(1, 0)}
	b, _ := bucket.New(1, 2, c.Now)
	w, _ := window.New(1, time.Minute, c.Now)
	comp := limiter.NewComposite(b, w)
	comp.Allow()
	if comp.Allow() {
		t.Fatal("window rejects second")
	}
	if !b.Allow() {
		t.Fatal("token consumed by rejected request must be refunded")
	}
}

/** @id TEST-LIMITER-005 @verifies REQ-LIMITER-005 */
func TestTEST_LIMITER_005_sweepIdle(t *testing.T) {
	c := &clk{t: time.Unix(1, 0)}
	r := limiter.NewRegistry(bucketFactory(c, 1), c.Now)
	r.Allow("old")
	c.Advance(10 * time.Minute)
	r.Allow("fresh")
	if n := r.Sweep(5 * time.Minute); n != 1 {
		t.Fatalf("swept %d want 1", n)
	}
	if r.Len() != 1 {
		t.Fatalf("len %d want 1", r.Len())
	}
}

/** @id TEST-LIMITER-006 @verifies REQ-LIMITER-006 */
func TestTEST_LIMITER_006_oneLimiterPerKeyConcurrent(t *testing.T) {
	c := &clk{t: time.Unix(1, 0)}
	var made int32
	r := limiter.NewRegistry(func() limiter.Limiter {
		atomic.AddInt32(&made, 1)
		b, _ := bucket.New(1, 1000, c.Now)
		return b
	}, c.Now)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); r.Allow("same") }()
	}
	wg.Wait()
	if made != 1 {
		t.Fatalf("created %d limiters", made)
	}
}
