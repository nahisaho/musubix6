// Package pool is a priority worker pool with admission rate limiting,
// context cancellation and graceful shutdown.
package pool

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"

	"example.com/rl/limiter"
	"example.com/rl/pq"
)

var (
	ErrInvalidConfig = errors.New("pool: invalid config")
	ErrRateLimited   = errors.New("pool: rate limited")
	ErrClosed        = errors.New("pool: closed")
)

type Job func(ctx context.Context) error

type Config struct {
	Workers int
	Limiter limiter.Limiter
}

type Stats struct{ Completed, Failed int64 }

type Future struct {
	done chan struct{}
	err  error
}

type task struct {
	ctx context.Context
	job Job
	fut *Future
}

type Pool struct {
	cfg       Config
	q         *pq.Queue
	mu        sync.Mutex
	started   bool
	closed    bool
	wg        sync.WaitGroup
	baseCtx   context.Context
	baseStop  context.CancelFunc
	completed int64
	failed    int64
}

/** @id CODE-POOL-001 @implements REQ-POOL-001 */
func New(cfg Config) (*Pool, error) {
	if cfg.Workers <= 0 {
		return nil, ErrInvalidConfig
	}
	base, stop := context.WithCancel(context.Background())
	return &Pool{cfg: cfg, q: pq.New(), baseCtx: base, baseStop: stop}, nil
}

/** @id CODE-POOL-002 @implements REQ-POOL-002 REQ-POOL-003 */
func (p *Pool) Start() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.started {
		return
	}
	p.started = true
	for i := 0; i < p.cfg.Workers; i++ {
		p.wg.Add(1)
		go p.worker()
	}
}

func (p *Pool) worker() {
	defer p.wg.Done()
	for {
		v, err := p.q.PopWait(context.Background())
		if err != nil {
			return
		}
		p.run(v.(*task))
	}
}

/** @id CODE-POOL-003 @implements REQ-POOL-004 REQ-POOL-008 REQ-POOL-010 */
func (p *Pool) run(t *task) {
	if err := t.ctx.Err(); err != nil {
		p.finish(t.fut, err)
		return
	}
	if err := p.baseCtx.Err(); err != nil {
		p.finish(t.fut, err)
		return
	}
	jctx, cancel := context.WithCancel(p.baseCtx)
	defer cancel()
	stop := context.AfterFunc(t.ctx, cancel)
	defer stop()
	p.finish(t.fut, safeCall(jctx, t.job))
}

func safeCall(ctx context.Context, j Job) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("pool: job panicked: %v", r)
		}
	}()
	return j(ctx)
}

func (p *Pool) finish(f *Future, err error) {
	if err != nil {
		atomic.AddInt64(&p.failed, 1)
	} else {
		atomic.AddInt64(&p.completed, 1)
	}
	f.err = err
	close(f.done)
}

/** @id CODE-POOL-004 @implements REQ-POOL-005 REQ-POOL-006 */
func (p *Pool) Submit(ctx context.Context, prio int, j Job) (*Future, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return nil, ErrClosed
	}
	if p.cfg.Limiter != nil && !p.cfg.Limiter.Allow() {
		return nil, ErrRateLimited
	}
	f := &Future{done: make(chan struct{})}
	if err := p.q.Push(&task{ctx: ctx, job: j, fut: f}, prio); err != nil {
		return nil, ErrClosed
	}
	return f, nil
}

// Shutdown starts the workers if needed so that queued jobs can drain.
/** @id CODE-POOL-005 @implements REQ-POOL-006 REQ-POOL-007 */
func (p *Pool) Shutdown(ctx context.Context) error {
	p.mu.Lock()
	p.closed = true
	p.mu.Unlock()
	p.Start()
	p.q.Close()
	drained := make(chan struct{})
	go func() { p.wg.Wait(); close(drained) }()
	select {
	case <-drained:
		return nil
	case <-ctx.Done():
		p.baseStop()
		return ctx.Err()
	}
}

/** @id CODE-POOL-006 @implements REQ-POOL-009 */
func (f *Future) Wait(ctx context.Context) error {
	select {
	case <-f.done:
		return f.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

/** @id CODE-POOL-007 @implements REQ-POOL-010 */
func (p *Pool) Stats() Stats {
	return Stats{Completed: atomic.LoadInt64(&p.completed), Failed: atomic.LoadInt64(&p.failed)}
}
