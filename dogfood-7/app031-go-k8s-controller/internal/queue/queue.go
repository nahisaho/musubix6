package queue

import (
	"dogfood.local/controller/internal/clock"
	"sort"
	"sync"
	"time"
)

type delayed struct {
	due   time.Time
	order uint64
}
type Queue[K comparable] struct {
	mu                sync.Mutex
	clock             clock.Clock
	base, max         time.Duration
	pending           []K
	dirty, processing map[K]bool
	retries           map[K]int
	delayed           map[K]delayed
	sequence          uint64
	closed            bool
}

func New[K comparable](c clock.Clock, base, max time.Duration) *Queue[K] {
	if base <= 0 {
		base = time.Millisecond
	}
	if max < base {
		max = base
	}
	return &Queue[K]{clock: c, base: base, max: max, dirty: make(map[K]bool), processing: make(map[K]bool), retries: make(map[K]int), delayed: make(map[K]delayed)}
}

// @id CODE-QUEUE-001
// @implements REQ-QUEUE-001 REQ-QUEUE-002 REQ-QUEUE-003 REQ-QUEUE-004 REQ-QUEUE-005 REQ-QUEUE-006 REQ-QUEUE-007 REQ-QUEUE-008 REQ-QUEUE-009
func (q *Queue[K]) Add(key K) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.add(key)
}
func (q *Queue[K]) add(key K) {
	if q.closed || q.dirty[key] {
		return
	}
	q.dirty[key] = true
	if !q.processing[key] {
		q.pending = append(q.pending, key)
	}
}
func (q *Queue[K]) Get() (K, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed || len(q.pending) == 0 {
		var zero K
		return zero, false
	}
	key := q.pending[0]
	var zero K
	q.pending[0] = zero
	q.pending = q.pending[1:]
	delete(q.dirty, key)
	q.processing[key] = true
	return key, true
}
func (q *Queue[K]) Done(key K) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if !q.processing[key] {
		return
	}
	delete(q.processing, key)
	if q.dirty[key] && !q.closed {
		q.pending = append(q.pending, key)
	}
}
func (q *Queue[K]) AddRateLimited(key K) time.Duration {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return 0
	}
	d := q.retryDelay(q.retries[key])
	q.retries[key]++
	due := q.clock.Now().Add(d)
	if old, ok := q.delayed[key]; !ok || due.Before(old.due) {
		q.sequence++
		q.delayed[key] = delayed{due: due, order: q.sequence}
	}
	return d
}

func (q *Queue[K]) retryDelay(attempt int) time.Duration {
	d := q.base
	for i := 0; i < attempt && d < q.max; i++ {
		if d > q.max/2 {
			return q.max
		}
		d *= 2
	}
	return d
}

// @id CODE-QUEUE-002
// @implements REQ-QUEUE-010
func (q *Queue[K]) Forget(key K) {
	q.mu.Lock()
	defer q.mu.Unlock()
	delete(q.retries, key)
	delete(q.delayed, key)
}
func (q *Queue[K]) NumRequeues(key K) int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.retries[key]
}
func (q *Queue[K]) Tick() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return
	}
	now := q.clock.Now()
	keys := make([]K, 0)
	for key, d := range q.delayed {
		if !d.due.After(now) {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool {
		a, b := q.delayed[keys[i]], q.delayed[keys[j]]
		if a.due.Equal(b.due) {
			return a.order < b.order
		}
		return a.due.Before(b.due)
	})
	for _, key := range keys {
		delete(q.delayed, key)
		q.add(key)
	}
}
func (q *Queue[K]) ShutDown() {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.closed = true
	q.pending = nil
	clear(q.delayed)
	clear(q.dirty)
}
