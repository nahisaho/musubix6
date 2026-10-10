// Package pq is a closable priority queue with blocking pop.
package pq

import (
	"container/heap"
	"context"
	"errors"
	"sync"
)

var ErrClosed = errors.New("pq: closed")

type entry struct {
	v    any
	prio int
	seq  uint64
}

// byPrio is a heap.Interface: highest prio first, lowest seq (FIFO) among equals.
type byPrio []entry

func (h byPrio) Len() int { return len(h) }
func (h byPrio) Less(i, j int) bool {
	if h[i].prio != h[j].prio {
		return h[i].prio > h[j].prio
	}
	return h[i].seq < h[j].seq
}
func (h byPrio) Swap(i, j int) { h[i], h[j] = h[j], h[i] }
func (h *byPrio) Push(x any)   { *h = append(*h, x.(entry)) }
func (h *byPrio) Pop() any {
	old := *h
	e := old[len(old)-1]
	*h = old[:len(old)-1]
	return e
}

type Queue struct {
	mu     sync.Mutex
	items  byPrio
	seq    uint64
	closed bool
	wake   chan struct{}
}

func New() *Queue { return &Queue{wake: make(chan struct{})} }

// broadcast wakes every PopWait waiter; caller holds mu.
func (q *Queue) broadcast() {
	close(q.wake)
	q.wake = make(chan struct{})
}

/** @id CODE-PQ-001 @implements REQ-PQ-001 REQ-PQ-002 REQ-PQ-005 */
func (q *Queue) Push(v any, prio int) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return ErrClosed
	}
	q.seq++
	heap.Push(&q.items, entry{v: v, prio: prio, seq: q.seq})
	q.broadcast()
	return nil
}

/** @id CODE-PQ-002 @implements REQ-PQ-003 */
func (q *Queue) Pop() (any, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.pop()
}

func (q *Queue) pop() (any, bool) {
	if len(q.items) == 0 {
		return nil, false
	}
	return heap.Pop(&q.items).(entry).v, true
}

/** @id CODE-PQ-003 @implements REQ-PQ-004 */
func (q *Queue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items)
}

/** @id CODE-PQ-004 @implements REQ-PQ-005 */
func (q *Queue) Close() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if !q.closed {
		q.closed = true
		q.broadcast()
	}
}

/** @id CODE-PQ-005 @implements REQ-PQ-006 REQ-PQ-007 REQ-PQ-008 */
func (q *Queue) PopWait(ctx context.Context) (any, error) {
	for {
		q.mu.Lock()
		if v, ok := q.pop(); ok {
			q.mu.Unlock()
			return v, nil
		}
		if q.closed {
			q.mu.Unlock()
			return nil, ErrClosed
		}
		wake := q.wake
		q.mu.Unlock()
		select {
		case <-wake:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}
