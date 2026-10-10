// Package window implements a thread-safe sliding-window-log limiter.
package window

import (
	"errors"
	"sync"
	"time"
)

var ErrInvalidConfig = errors.New("window: invalid config")

type Window struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	now    func() time.Time
	events []time.Time
}

/** @id CODE-WINDOW-001 @implements REQ-WINDOW-001 */
func New(limit int, d time.Duration, now func() time.Time) (*Window, error) {
	if limit <= 0 || d <= 0 {
		return nil, ErrInvalidConfig
	}
	if now == nil {
		now = time.Now
	}
	return &Window{limit: limit, window: d, now: now}, nil
}

/** @id CODE-WINDOW-002 @implements REQ-WINDOW-003 REQ-WINDOW-007 */
func (w *Window) evict(now time.Time) {
	cutoff := now.Add(-w.window)
	i := 0
	for i < len(w.events) && !w.events[i].After(cutoff) {
		i++
	}
	w.events = w.events[i:]
}

/** @id CODE-WINDOW-003 @implements REQ-WINDOW-002 REQ-WINDOW-005 */
func (w *Window) Allow() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	now := w.now()
	w.evict(now)
	if len(w.events) >= w.limit {
		return false
	}
	w.events = append(w.events, now)
	return true
}

/** @id CODE-WINDOW-004 @implements REQ-WINDOW-004 */
func (w *Window) Remaining() int {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.evict(w.now())
	return w.limit - len(w.events)
}

/** @id CODE-WINDOW-005 @implements REQ-WINDOW-006 */
func (w *Window) Reset() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.events = nil
}
