package bucket_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"example.com/rl/bucket"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

func newClock() *fakeClock { return &fakeClock{t: time.Unix(1000, 0)} }

/** @id TEST-BUCKET-001 @verifies REQ-BUCKET-001 */
func TestTEST_BUCKET_001_startsFull(t *testing.T) {
	c := newClock()
	b, err := bucket.New(1, 3, c.Now)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if !b.Allow() {
			t.Fatalf("token %d should be available", i)
		}
	}
	if b.Allow() {
		t.Fatal("4th must be denied")
	}
}

/** @id TEST-BUCKET-002 @verifies REQ-BUCKET-002 */
func TestTEST_BUCKET_002_allowConsumes(t *testing.T) {
	c := newClock()
	b, _ := bucket.New(1, 1, c.Now)
	if !b.Allow() {
		t.Fatal("first allowed")
	}
	if b.Allow() {
		t.Fatal("second denied")
	}
}

/** @id TEST-BUCKET-003 @verifies REQ-BUCKET-003 */
func TestTEST_BUCKET_003_refillCapped(t *testing.T) {
	c := newClock()
	b, _ := bucket.New(2, 4, c.Now)
	b.AllowN(4)
	c.Advance(500 * time.Millisecond)
	if !b.Allow() || b.Allow() {
		t.Fatal("expected exactly 1 token after 0.5s at 2/s")
	}
	c.Advance(time.Hour)
	if !b.AllowN(4) || b.Allow() {
		t.Fatal("refill must cap at burst")
	}
}

/** @id TEST-BUCKET-004 @verifies REQ-BUCKET-004 */
func TestTEST_BUCKET_004_allowNAtomic(t *testing.T) {
	c := newClock()
	b, _ := bucket.New(1, 3, c.Now)
	if b.AllowN(4) {
		t.Fatal("4 > 3 denied")
	}
	if !b.AllowN(3) {
		t.Fatal("denied AllowN must not have consumed tokens")
	}
}

/** @id TEST-BUCKET-005 @verifies REQ-BUCKET-005 */
func TestTEST_BUCKET_005_invalidConfig(t *testing.T) {
	if _, err := bucket.New(0, 1, time.Now); !errors.Is(err, bucket.ErrInvalidConfig) {
		t.Fatalf("rate 0: %v", err)
	}
	if _, err := bucket.New(1, 0, time.Now); !errors.Is(err, bucket.ErrInvalidConfig) {
		t.Fatalf("burst 0: %v", err)
	}
}

/** @id TEST-BUCKET-006 @verifies REQ-BUCKET-006 */
func TestTEST_BUCKET_006_waitCtx(t *testing.T) {
	b, _ := bucket.New(1000, 1, time.Now)
	b.Allow()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := b.Wait(ctx); err != nil {
		t.Fatalf("wait should succeed quickly: %v", err)
	}
	slow, _ := bucket.New(0.001, 1, time.Now)
	slow.Allow()
	ctx2, cancel2 := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel2()
	if err := slow.Wait(ctx2); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want deadline, got %v", err)
	}
}

/** @id TEST-BUCKET-007 @verifies REQ-BUCKET-007 */
func TestTEST_BUCKET_007_concurrent(t *testing.T) {
	c := newClock()
	b, _ := bucket.New(1, 50, c.Now)
	var granted int64
	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if b.Allow() {
				atomic.AddInt64(&granted, 1)
			}
		}()
	}
	wg.Wait()
	if granted != 50 {
		t.Fatalf("granted %d want 50", granted)
	}
}

/** @id TEST-BUCKET-008 @verifies REQ-BUCKET-008 */
func TestTEST_BUCKET_008_retryAfter(t *testing.T) {
	c := newClock()
	b, _ := bucket.New(2, 1, c.Now)
	if d := b.RetryAfter(); d != 0 {
		t.Fatalf("want 0 got %v", d)
	}
	b.Allow()
	if d := b.RetryAfter(); d != 500*time.Millisecond {
		t.Fatalf("want 500ms got %v", d)
	}
}

/** @id TEST-BUCKET-009 @verifies REQ-BUCKET-009 */
func TestTEST_BUCKET_009_refund(t *testing.T) {
	c := newClock()
	b, _ := bucket.New(1, 2, c.Now)
	b.AllowN(2)
	b.Refund(1)
	if !b.Allow() || b.Allow() {
		t.Fatal("refund should restore exactly one token")
	}
	b.Refund(100)
	if !b.AllowN(2) || b.Allow() {
		t.Fatal("refund must cap at burst")
	}
}
