package trace

import (
	"context"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
)

type Context struct {
	TraceID [16]byte
	SpanID  [8]byte
	Flags   byte
}
type contextKey struct{}

var ErrInvalid = errors.New("invalid traceparent")

// @id CODE-TRACE-001 @implements REQ-TRACE-001 REQ-TRACE-002 REQ-TRACE-003 REQ-TRACE-004 REQ-TRACE-005 REQ-TRACE-006 REQ-TRACE-007 REQ-TRACE-008
func Parse(s string) (Context, error) {
	var c Context
	if len(s) != 55 || s[:3] != "00-" || s[35] != '-' || s[52] != '-' || strings.ToLower(s) != s {
		return c, ErrInvalid
	}
	a, e1 := hex.DecodeString(s[3:35])
	b, e2 := hex.DecodeString(s[36:52])
	f, e3 := hex.DecodeString(s[53:55])
	if e1 != nil || e2 != nil || e3 != nil {
		return c, ErrInvalid
	}
	copy(c.TraceID[:], a)
	copy(c.SpanID[:], b)
	c.Flags = f[0]
	if !c.Valid() {
		return Context{}, ErrInvalid
	}
	return c, nil
}
func (c Context) Valid() bool { return c.TraceID != [16]byte{} && c.SpanID != [8]byte{} }
func (c Context) String() string {
	return "00-" + hex.EncodeToString(c.TraceID[:]) + "-" + hex.EncodeToString(c.SpanID[:]) + "-" + hex.EncodeToString([]byte{c.Flags})
}
func (c Context) Child(span [8]byte) (Context, error) {
	if span == [8]byte{} || !c.Valid() {
		return Context{}, ErrInvalid
	}
	c.SpanID = span
	return c, nil
}
func With(ctx context.Context, c Context) context.Context {
	return context.WithValue(ctx, contextKey{}, c)
}
func From(ctx context.Context) (Context, bool) {
	c, ok := ctx.Value(contextKey{}).(Context)
	return c, ok && c.Valid()
}
func Inject(ctx context.Context, h http.Header) {
	if c, ok := From(ctx); ok {
		h.Set("traceparent", c.String())
	}
}
func Extract(ctx context.Context, h http.Header) (context.Context, error) {
	c, err := Parse(h.Get("traceparent"))
	if err != nil {
		return ctx, err
	}
	return With(ctx, c), nil
}
