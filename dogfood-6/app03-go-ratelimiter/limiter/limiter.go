// Package limiter combines bucket and window limiters and manages them per key.
package limiter

import (
	"sync"
	"time"

	"example.com/rl/bucket"
	"example.com/rl/window"
)

type Limiter interface{ Allow() bool }

type Composite struct {
	b *bucket.Bucket
	w *window.Window
}

func NewComposite(b *bucket.Bucket, w *window.Window) *Composite {
	return &Composite{b: b, w: w}
}

/** @id CODE-LIMITER-001 @implements REQ-LIMITER-003 REQ-LIMITER-004 */
func (c *Composite) Allow() bool {
	if !c.b.Allow() {
		return false
	}
	if !c.w.Allow() {
		c.b.Refund(1)
		return false
	}
	return true
}

type entry struct {
	lim  Limiter
	used time.Time
}

type Registry struct {
	mu      sync.Mutex
	factory func() Limiter
	now     func() time.Time
	m       map[string]*entry
}

func NewRegistry(f func() Limiter, now func() time.Time) *Registry {
	if now == nil {
		now = time.Now
	}
	return &Registry{factory: f, now: now, m: map[string]*entry{}}
}

/** @id CODE-LIMITER-002 @implements REQ-LIMITER-001 REQ-LIMITER-002 REQ-LIMITER-006 */
func (r *Registry) Allow(key string) bool {
	r.mu.Lock()
	e, ok := r.m[key]
	if !ok {
		e = &entry{lim: r.factory()}
		r.m[key] = e
	}
	e.used = r.now()
	r.mu.Unlock()
	return e.lim.Allow()
}

/** @id CODE-LIMITER-003 @implements REQ-LIMITER-005 */
func (r *Registry) Sweep(idle time.Duration) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	cutoff := r.now().Add(-idle)
	n := 0
	for k, e := range r.m {
		if !e.used.After(cutoff) {
			delete(r.m, k)
			n++
		}
	}
	return n
}

func (r *Registry) Len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.m)
}
