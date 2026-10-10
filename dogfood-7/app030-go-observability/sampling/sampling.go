package sampling

import (
	"bytes"
	"errors"
	"example.org/observability/trace"
	"sort"
	"sync"
	"time"
)

var ErrCapacity = errors.New("sampler capacity exceeded")

type Span struct {
	trace.Context
	Duration time.Duration
	Error    bool
}
type Decision struct {
	TraceID [16]byte
	Keep    bool
	Spans   []Span
}
type pending struct {
	first time.Time
	spans []Span
}
type Sampler struct {
	mu              sync.Mutex
	capacity        int
	wait, threshold time.Duration
	traces          map[[16]byte]*pending
}

// @id CODE-SAMPLE-001 @implements REQ-SAMPLE-001 REQ-SAMPLE-002 REQ-SAMPLE-003 REQ-SAMPLE-004 REQ-SAMPLE-005 REQ-SAMPLE-006 REQ-SAMPLE-007 REQ-SAMPLE-008 REQ-SAMPLE-009
func New(capacity int, wait, threshold time.Duration) *Sampler {
	if capacity <= 0 || wait < 0 || threshold < 0 {
		panic("invalid sampler configuration")
	}
	return &Sampler{capacity: capacity, wait: wait, threshold: threshold, traces: make(map[[16]byte]*pending)}
}
func (s *Sampler) CanAdd(span Span) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, ok := s.traces[span.TraceID]; ok {
		return len(p.spans) < s.capacity
	}
	return len(s.traces) < s.capacity
}
func (s *Sampler) Add(span Span, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.traces[span.TraceID]
	if !ok {
		if len(s.traces) >= s.capacity {
			return ErrCapacity
		}
		p = &pending{first: now}
		s.traces[span.TraceID] = p
	}
	if len(p.spans) >= s.capacity {
		return ErrCapacity
	}
	p.spans = append(p.spans, span)
	return nil
}
func (s *Sampler) Flush(now time.Time) []Decision {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Decision
	for id, p := range s.traces {
		if now.Sub(p.first) < s.wait {
			continue
		}
		d := Decision{TraceID: id, Spans: append([]Span(nil), p.spans...)}
		for _, span := range p.spans {
			if span.Error || span.Duration >= s.threshold {
				d.Keep = true
			}
		}
		out = append(out, d)
		delete(s.traces, id)
	}
	sort.Slice(out, func(i, j int) bool { return bytes.Compare(out[i].TraceID[:], out[j].TraceID[:]) < 0 })
	return out
}
