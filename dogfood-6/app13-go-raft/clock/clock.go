// Package clock is a deterministic fake clock with ordered timers.
package clock

import (
	"container/heap"
	"errors"
)

var ErrNegative = errors.New("clock: negative advance")

type Timer struct {
	when  int64
	seq   uint64
	f     func()
	state int // 0 pending, 1 fired, 2 stopped
	c     *Clock
	idx   int
}

type timerHeap []*Timer

func (h timerHeap) Len() int { return len(h) }
func (h timerHeap) Less(i, j int) bool {
	if h[i].when != h[j].when {
		return h[i].when < h[j].when
	}
	return h[i].seq < h[j].seq
}
func (h timerHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].idx, h[j].idx = i, j
}
func (h *timerHeap) Push(x any) {
	t := x.(*Timer)
	t.idx = len(*h)
	*h = append(*h, t)
}
func (h *timerHeap) Pop() any {
	old := *h
	t := old[len(old)-1]
	*h = old[:len(old)-1]
	return t
}

type Clock struct {
	now int64
	seq uint64
	h   timerHeap
}

func New() *Clock { return &Clock{} }

// @id CODE-CLOCK-001 @implements REQ-CLOCK-001
func (c *Clock) Now() int64 { return c.now }

func (c *Clock) Pending() int { return len(c.h) }

/** @id CODE-CLOCK-002 @implements REQ-CLOCK-002 REQ-CLOCK-003 REQ-CLOCK-004 REQ-CLOCK-005 REQ-CLOCK-006 REQ-CLOCK-008 */
func (c *Clock) Advance(d int64) error {
	if d < 0 {
		return ErrNegative
	}
	target := c.now + d
	for len(c.h) > 0 && c.h[0].when <= target {
		t := heap.Pop(&c.h).(*Timer)
		c.now = t.when
		t.state = 1
		t.f()
	}
	c.now = target
	return nil
}

/** @id CODE-CLOCK-003 @implements REQ-CLOCK-009 */
func (c *Clock) AfterFunc(d int64, f func()) *Timer {
	if d < 0 {
		d = 0
	}
	c.seq++
	t := &Timer{when: c.now + d, seq: c.seq, f: f, c: c}
	heap.Push(&c.h, t)
	return t
}

/** @id CODE-CLOCK-004 @implements REQ-CLOCK-007 */
func (t *Timer) Stop() bool {
	if t.state != 0 {
		return false
	}
	t.state = 2
	heap.Remove(&t.c.h, t.idx)
	return true
}
