package pool_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"example.com/rl/pool"
)

type denyAll struct{}

func (denyAll) Allow() bool { return false }

type allowAll struct{}

func (allowAll) Allow() bool { return true }

func mustNew(t *testing.T, cfg pool.Config) *pool.Pool {
	t.Helper()
	p, err := pool.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func shutdownOK(t *testing.T, p *pool.Pool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := p.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
}

/** @id TEST-POOL-001 @verifies REQ-POOL-001 */
func TestTEST_POOL_001_invalidWorkers(t *testing.T) {
	if _, err := pool.New(pool.Config{Workers: 0}); !errors.Is(err, pool.ErrInvalidConfig) {
		t.Fatalf("got %v", err)
	}
	if _, err := pool.New(pool.Config{Workers: -1}); !errors.Is(err, pool.ErrInvalidConfig) {
		t.Fatalf("got %v", err)
	}
}

/** @id TEST-POOL-002 @verifies REQ-POOL-002 */
func TestTEST_POOL_002_priorityOrder(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 1})
	var mu sync.Mutex
	var order []int
	for _, prio := range []int{1, 5, 3} {
		prio := prio
		_, err := p.Submit(context.Background(), prio, func(ctx context.Context) error {
			mu.Lock()
			order = append(order, prio)
			mu.Unlock()
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	p.Start()
	shutdownOK(t, p)
	if len(order) != 3 || order[0] != 5 || order[1] != 3 || order[2] != 1 {
		t.Fatalf("order %v", order)
	}
}

/** @id TEST-POOL-003 @verifies REQ-POOL-003 */
func TestTEST_POOL_003_boundedConcurrency(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 3})
	p.Start()
	var cur, max int32
	started := make(chan struct{}, 10)
	release := make(chan struct{})
	for i := 0; i < 6; i++ {
		_, err := p.Submit(context.Background(), 0, func(ctx context.Context) error {
			n := atomic.AddInt32(&cur, 1)
			for {
				m := atomic.LoadInt32(&max)
				if n <= m || atomic.CompareAndSwapInt32(&max, m, n) {
					break
				}
			}
			started <- struct{}{}
			<-release
			atomic.AddInt32(&cur, -1)
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 3; i++ {
		select {
		case <-started:
		case <-time.After(2 * time.Second):
			t.Fatal("did not reach 3 concurrent jobs")
		}
	}
	time.Sleep(30 * time.Millisecond)
	if m := atomic.LoadInt32(&max); m != 3 {
		t.Fatalf("max concurrency %d want 3", m)
	}
	close(release)
	shutdownOK(t, p)
	if m := atomic.LoadInt32(&max); m != 3 {
		t.Fatalf("max concurrency %d want 3", m)
	}
}

/** @id TEST-POOL-004 @verifies REQ-POOL-004 */
func TestTEST_POOL_004_cancelledBeforeStart(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 1})
	ctx, cancel := context.WithCancel(context.Background())
	var ran int32
	f, err := p.Submit(ctx, 1, func(ctx context.Context) error {
		atomic.AddInt32(&ran, 1)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	cancel()
	p.Start()
	wctx, wcancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer wcancel()
	if err := f.Wait(wctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
	shutdownOK(t, p)
	if atomic.LoadInt32(&ran) != 0 {
		t.Fatal("cancelled job must not run")
	}
}

/** @id TEST-POOL-005 @verifies REQ-POOL-005 */
func TestTEST_POOL_005_rateLimited(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 1, Limiter: denyAll{}})
	var ran int32
	f, err := p.Submit(context.Background(), 1, func(ctx context.Context) error {
		atomic.AddInt32(&ran, 1)
		return nil
	})
	if !errors.Is(err, pool.ErrRateLimited) || f != nil {
		t.Fatalf("got %v %v", f, err)
	}
	p.Start()
	shutdownOK(t, p)
	if atomic.LoadInt32(&ran) != 0 {
		t.Fatal("rejected job must not run")
	}
}

/** @id TEST-POOL-006 @verifies REQ-POOL-006 */
func TestTEST_POOL_006_gracefulShutdown(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 2, Limiter: allowAll{}})
	p.Start()
	var done int32
	for i := 0; i < 10; i++ {
		_, err := p.Submit(context.Background(), 0, func(ctx context.Context) error {
			time.Sleep(5 * time.Millisecond)
			atomic.AddInt32(&done, 1)
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	shutdownOK(t, p)
	if atomic.LoadInt32(&done) != 10 {
		t.Fatalf("drained %d of 10", done)
	}
	if _, err := p.Submit(context.Background(), 0, func(ctx context.Context) error { return nil }); !errors.Is(err, pool.ErrClosed) {
		t.Fatalf("got %v", err)
	}
}

/** @id TEST-POOL-007 @verifies REQ-POOL-007 */
func TestTEST_POOL_007_forcedShutdown(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 1})
	p.Start()
	observed := make(chan error, 1)
	_, err := p.Submit(context.Background(), 0, func(ctx context.Context) error {
		<-ctx.Done()
		observed <- ctx.Err()
		return ctx.Err()
	})
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(20 * time.Millisecond)
	sctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if err := p.Shutdown(sctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v", err)
	}
	select {
	case e := <-observed:
		if !errors.Is(e, context.Canceled) {
			t.Fatalf("job saw %v", e)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("running job context was not cancelled")
	}
}

/** @id TEST-POOL-008 @verifies REQ-POOL-008 */
func TestTEST_POOL_008_panicRecovered(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 1})
	p.Start()
	f1, _ := p.Submit(context.Background(), 9, func(ctx context.Context) error { panic("boom") })
	var ran int32
	f2, _ := p.Submit(context.Background(), 1, func(ctx context.Context) error {
		atomic.AddInt32(&ran, 1)
		return nil
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := f1.Wait(ctx); err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("got %v", err)
	}
	if err := f2.Wait(ctx); err != nil {
		t.Fatalf("worker must survive: %v", err)
	}
	shutdownOK(t, p)
}

/** @id TEST-POOL-009 @verifies REQ-POOL-009 */
func TestTEST_POOL_009_futureWait(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 1})
	p.Start()
	want := errors.New("job failed")
	f, _ := p.Submit(context.Background(), 0, func(ctx context.Context) error { return want })
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := f.Wait(ctx); !errors.Is(err, want) {
		t.Fatalf("got %v", err)
	}
	block := make(chan struct{})
	g, _ := p.Submit(context.Background(), 0, func(ctx context.Context) error { <-block; return nil })
	short, c2 := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer c2()
	if err := g.Wait(short); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v", err)
	}
	close(block)
	shutdownOK(t, p)
}

/** @id TEST-POOL-010 @verifies REQ-POOL-010 */
func TestTEST_POOL_010_stats(t *testing.T) {
	p := mustNew(t, pool.Config{Workers: 1})
	p.Start()
	ctx := context.Background()
	p.Submit(ctx, 0, func(ctx context.Context) error { return nil })
	p.Submit(ctx, 0, func(ctx context.Context) error { return errors.New("x") })
	p.Submit(ctx, 0, func(ctx context.Context) error { panic("y") })
	shutdownOK(t, p)
	s := p.Stats()
	if s.Completed != 1 || s.Failed != 2 {
		t.Fatalf("stats %+v", s)
	}
}
