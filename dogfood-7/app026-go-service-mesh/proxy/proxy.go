package proxy

import (
	mesh "dogfood.mesh"
	"dogfood.mesh/balance"
	"dogfood.mesh/circuit"
	"errors"
	"fmt"
	"math"
	"sync"
)

var ErrRetryable = errors.New("retryable")
var ErrDeadline = errors.New("deadline")

type Request struct {
	Idempotent bool
	Deadline   int64
	Key        string
}
type outlier struct {
	failures int
	until    int64
}
type Proxy struct {
	mu        sync.Mutex
	snapshot  mesh.Snapshot
	circuit   *circuit.Circuit
	balancer  *balance.Balancer
	threshold int
	duration  int64
	outliers  map[string]outlier
	active    map[string]int
}

func New(c *circuit.Circuit, threshold int, duration int64) *Proxy {
	if c == nil || threshold <= 0 || duration < 0 {
		panic("invalid proxy configuration")
	}
	return &Proxy{circuit: c, balancer: balance.New(), threshold: threshold, duration: duration, outliers: make(map[string]outlier), active: make(map[string]int)}
}

// @id CODE-RESILIENCE-001 @implements REQ-RESILIENCE-002
func (p *Proxy) Update(s mesh.Snapshot) error {
	if err := s.Validate(); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if s.Version <= p.snapshot.Version {
		return fmt.Errorf("stale snapshot")
	}
	p.snapshot = s.Clone()
	for id := range p.outliers {
		found := false
		for _, e := range s.Endpoints {
			if e.ID == id {
				found = true
				break
			}
		}
		if !found {
			delete(p.outliers, id)
		}
	}
	return nil
}

// @id CODE-RESILIENCE-002 @implements REQ-RESILIENCE-001 REQ-RESILIENCE-003 REQ-RESILIENCE-004 REQ-RESILIENCE-005 REQ-RESILIENCE-006 REQ-RESILIENCE-007 REQ-RESILIENCE-008 REQ-RESILIENCE-009 REQ-RESILIENCE-010 REQ-RESILIENCE-011 REQ-RESILIENCE-012 REQ-RESILIENCE-013 REQ-RESILIENCE-014
func (p *Proxy) Do(r Request, now int64, retries int, backoff int64, call func(mesh.Endpoint) (string, error)) (string, error) {
	if retries < 0 || backoff < 0 || call == nil {
		return "", fmt.Errorf("invalid request options")
	}
	for attempt := 0; ; attempt++ {
		if now >= r.Deadline {
			return "", ErrDeadline
		}
		done, err := p.circuit.Acquire(now)
		if err != nil {
			return "", err
		}
		p.mu.Lock()
		es := p.snapshot.Clone().Endpoints
		for i, e := range es {
			o := p.outliers[e.ID]
			if o.until > now {
				es[i].Healthy = false
			} else if o.until != 0 {
				delete(p.outliers, e.ID)
			}
		}
		e, err := p.balancer.Pick("round-robin", es, r.Key, p.active)
		if err != nil {
			p.mu.Unlock()
			done(true, now)
			return "", err
		}
		p.active[e.ID]++
		p.mu.Unlock()
		response, err := call(e)
		done(err == nil, now)
		p.finish(e.ID, err, now)
		if err == nil {
			return response, nil
		}
		if !r.Idempotent || !errors.Is(err, ErrRetryable) || attempt >= retries {
			return "", err
		}
		if now > math.MaxInt64-backoff {
			return "", ErrDeadline
		}
		now += backoff
	}
}

func (p *Proxy) finish(id string, err error, now int64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.active[id]--
	o := p.outliers[id]
	if err == nil {
		if o.until <= now {
			delete(p.outliers, id)
		}
		return
	}
	o.failures++
	if o.failures >= p.threshold {
		if until := saturatingAdd(now, p.duration); until > o.until {
			o.until = until
		}
	}
	p.outliers[id] = o
}

func saturatingAdd(now, delta int64) int64 {
	if now > math.MaxInt64-delta {
		return math.MaxInt64
	}
	return now + delta
}
