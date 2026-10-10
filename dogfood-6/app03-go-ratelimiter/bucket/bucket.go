// Package bucket implements a thread-safe token bucket.
package bucket

import (
	"context"
	"errors"
	"sync"
	"time"
)

var ErrInvalidConfig = errors.New("bucket: invalid config")

type Bucket struct {
	mu     sync.Mutex
	tokens float64
	last   time.Time
	rate   float64
	burst  float64
	now    func() time.Time
}

/** @id CODE-BUCKET-001 @implements REQ-BUCKET-001 REQ-BUCKET-005 */
func New(rate, burst float64, now func() time.Time) (*Bucket, error) {
	if rate <= 0 || burst <= 0 {
		return nil, ErrInvalidConfig
	}
	if now == nil {
		now = time.Now
	}
	return &Bucket{tokens: burst, last: now(), rate: rate, burst: burst, now: now}, nil
}

/** @id CODE-BUCKET-002 @implements REQ-BUCKET-003 */
func (b *Bucket) refill() {
	t := b.now()
	if el := t.Sub(b.last); el > 0 {
		b.tokens += el.Seconds() * b.rate
		if b.tokens > b.burst {
			b.tokens = b.burst
		}
		b.last = t
	}
}

/** @id CODE-BUCKET-003 @implements REQ-BUCKET-002 */
func (b *Bucket) Allow() bool { return b.AllowN(1) }

/** @id CODE-BUCKET-004 @implements REQ-BUCKET-004 REQ-BUCKET-007 */
func (b *Bucket) AllowN(n int) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.refill()
	if float64(n) > b.tokens {
		return false
	}
	b.tokens -= float64(n)
	return true
}

/** @id CODE-BUCKET-005 @implements REQ-BUCKET-006 */
func (b *Bucket) Wait(ctx context.Context) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		if b.Allow() {
			return nil
		}
		timer := time.NewTimer(b.RetryAfter())
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

/** @id CODE-BUCKET-006 @implements REQ-BUCKET-008 */
func (b *Bucket) RetryAfter() time.Duration {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.refill()
	if b.tokens >= 1 {
		return 0
	}
	return time.Duration((1 - b.tokens) / b.rate * float64(time.Second))
}

/** @id CODE-BUCKET-007 @implements REQ-BUCKET-009 */
func (b *Bucket) Refund(n int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.tokens += float64(n)
	if b.tokens > b.burst {
		b.tokens = b.burst
	}
}
