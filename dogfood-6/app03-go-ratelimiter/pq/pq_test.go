package pq

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

/** @id TEST-PQ-001 @verifies REQ-PQ-001 */
func TestTEST_PQ_001_highestFirst(t *testing.T) {
	q := New()
	q.Push("low", 1)
	q.Push("high", 9)
	q.Push("mid", 5)
	for _, want := range []string{"high", "mid", "low"} {
		got, ok := q.Pop()
		if !ok || got != want {
			t.Fatalf("got %v want %v", got, want)
		}
	}
}

/** @id TEST-PQ-002 @verifies REQ-PQ-002 */
func TestTEST_PQ_002_fifoOnTies(t *testing.T) {
	q := New()
	for i := 0; i < 5; i++ {
		q.Push(i, 3)
	}
	for i := 0; i < 5; i++ {
		got, _ := q.Pop()
		if got != i {
			t.Fatalf("got %v want %d", got, i)
		}
	}
}

/** @id TEST-PQ-003 @verifies REQ-PQ-003 */
func TestTEST_PQ_003_emptyPop(t *testing.T) {
	q := New()
	if _, ok := q.Pop(); ok {
		t.Fatal("empty pop must be !ok")
	}
}

/** @id TEST-PQ-004 @verifies REQ-PQ-004 */
func TestTEST_PQ_004_len(t *testing.T) {
	q := New()
	q.Push("a", 1)
	q.Push("b", 1)
	if q.Len() != 2 {
		t.Fatalf("len %d", q.Len())
	}
	q.Pop()
	if q.Len() != 1 {
		t.Fatalf("len %d", q.Len())
	}
}

/** @id TEST-PQ-005 @verifies REQ-PQ-005 */
func TestTEST_PQ_005_pushAfterClose(t *testing.T) {
	q := New()
	q.Close()
	if err := q.Push("x", 1); !errors.Is(err, ErrClosed) {
		t.Fatalf("got %v", err)
	}
}

/** @id TEST-PQ-006 @verifies REQ-PQ-006 */
func TestTEST_PQ_006_popWait(t *testing.T) {
	q := New()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := q.PopWait(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v", err)
	}
	go func() { time.Sleep(10 * time.Millisecond); q.Push("late", 1) }()
	got, err := q.PopWait(context.Background())
	if err != nil || got != "late" {
		t.Fatalf("got %v %v", got, err)
	}
}

/** @id TEST-PQ-007 @verifies REQ-PQ-007 */
func TestTEST_PQ_007_closedDrained(t *testing.T) {
	q := New()
	q.Push("last", 1)
	q.Close()
	if got, err := q.PopWait(context.Background()); err != nil || got != "last" {
		t.Fatalf("drain first: %v %v", got, err)
	}
	if _, err := q.PopWait(context.Background()); !errors.Is(err, ErrClosed) {
		t.Fatalf("got %v", err)
	}
}

/** @id TEST-PQ-008 @verifies REQ-PQ-008 */
func TestTEST_PQ_008_concurrentExactlyOnce(t *testing.T) {
	q := New()
	const n = 200
	var mu sync.Mutex
	seen := map[int]int{}
	var wg sync.WaitGroup
	for w := 0; w < 4; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				v, err := q.PopWait(context.Background())
				if err != nil {
					return
				}
				mu.Lock()
				seen[v.(int)]++
				mu.Unlock()
			}
		}()
	}
	for i := 0; i < n; i++ {
		q.Push(i, i%7)
	}
	q.Close()
	wg.Wait()
	if len(seen) != n {
		t.Fatalf("saw %d distinct want %d", len(seen), n)
	}
	for k, c := range seen {
		if c != 1 {
			t.Fatalf("item %d delivered %d times", k, c)
		}
	}
}
