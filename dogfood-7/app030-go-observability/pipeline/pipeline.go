package pipeline

import (
	"context"
	"errors"
	"example.org/observability/logging"
	"example.org/observability/metrics"
	"example.org/observability/sampling"
	"example.org/observability/trace"
	"sync"
	"time"
)

var ErrClosed = errors.New("pipeline is closed")
var ErrInvalid = errors.New("invalid span")
var ErrCapacity = errors.New("pipeline capacity exceeded")

type Pipeline struct {
	mu        sync.Mutex
	closed    bool
	capacity  int
	sampler   *sampling.Sampler
	histogram *metrics.Histogram
	logger    *logging.Logger
}

// @id CODE-PIPE-001 @implements REQ-PIPE-001 REQ-PIPE-002 REQ-PIPE-003 REQ-PIPE-004 REQ-PIPE-005 REQ-PIPE-006 REQ-PIPE-007 REQ-PIPE-008
func New(capacity int, wait, threshold time.Duration) *Pipeline {
	if capacity <= 0 || capacity > 1e6 {
		panic("invalid pipeline capacity")
	}
	return &Pipeline{capacity: capacity, sampler: sampling.New(capacity, wait, threshold), histogram: metrics.New(1e12), logger: logging.New(capacity)}
}
func (p *Pipeline) Add(ctx context.Context, span sampling.Span, now time.Time) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return ErrClosed
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if !span.Valid() || span.Duration < 0 || span.Duration > 1e12 {
		return ErrInvalid
	}
	if p.logger.Len() >= p.capacity || !p.sampler.CanAdd(span) {
		return ErrCapacity
	}
	if err := p.sampler.Add(span, now); err != nil {
		return err
	}
	if err := p.histogram.Record(int64(span.Duration)); err != nil {
		return err
	}
	return p.logger.Write(trace.With(ctx, span.Context), "info", "span", nil)
}
func (p *Pipeline) Close() { p.mu.Lock(); defer p.mu.Unlock(); p.closed = true }
func (p *Pipeline) Metrics() metrics.Snapshot {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.histogram.Snapshot()
}
func (p *Pipeline) Logs() []logging.Record {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.logger.Records()
}
func (p *Pipeline) Flush(now time.Time) []sampling.Decision {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.sampler.Flush(now)
}
