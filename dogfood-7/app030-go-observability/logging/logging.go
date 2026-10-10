package logging

import (
	"context"
	"encoding/hex"
	"errors"
	"example.org/observability/internal/copyutil"
	"example.org/observability/trace"
	"sync"
)

var ErrCapacity = errors.New("log capacity exceeded")

type Record map[string]string
type Logger struct {
	mu       sync.Mutex
	capacity int
	records  []Record
}

// @id CODE-LOG-001 @implements REQ-LOG-001 REQ-LOG-002 REQ-LOG-003 REQ-LOG-004 REQ-LOG-005 REQ-LOG-006 REQ-LOG-007 REQ-LOG-008
func New(capacity int) *Logger {
	if capacity <= 0 {
		panic("invalid log capacity")
	}
	return &Logger{capacity: capacity}
}

// @id CODE-LOG-002 @implements REQ-LOG-009
func (l *Logger) Write(ctx context.Context, level, message string, attrs map[string]string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.records) >= l.capacity {
		return ErrCapacity
	}
	r := Record(copyutil.Map(attrs))
	r["message"] = message
	r["level"] = level
	delete(r, "trace_id")
	delete(r, "span_id")
	if c, ok := trace.From(ctx); ok {
		r["trace_id"] = hex.EncodeToString(c.TraceID[:])
		r["span_id"] = hex.EncodeToString(c.SpanID[:])
	}
	l.records = append(l.records, r)
	return nil
}
func (l *Logger) Records() []Record {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]Record, len(l.records))
	for i, r := range l.records {
		out[i] = copyutil.Map(r)
	}
	return out
}
func (l *Logger) Len() int { l.mu.Lock(); defer l.mu.Unlock(); return len(l.records) }
