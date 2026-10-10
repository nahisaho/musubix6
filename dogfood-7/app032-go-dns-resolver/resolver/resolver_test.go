package resolver

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"dogfood.local/dns/cache"
	"dogfood.local/dns/dnssec"
	"dogfood.local/dns/wire"
	"fmt"
	"testing"
	"time"
)

type call struct {
	server string
	q      wire.Question
}
type fake struct {
	calls  []call
	fn     func(string, wire.Question) (wire.Message, error)
	proof  dnssec.Proof
	signed bool
}

func (f *fake) Exchange(ctx context.Context, s string, q wire.Question) (wire.Message, error) {
	if err := ctx.Err(); err != nil {
		return wire.Message{}, err
	}
	f.calls = append(f.calls, call{s, q})
	return f.fn(s, q)
}
func (f *fake) Proof(wire.Message) (dnssec.Proof, bool) { return f.proof, f.signed }
func positive(q wire.Question) wire.Message {
	return wire.Message{Flags: 0x8400, Questions: []wire.Question{q}, Answers: []wire.RR{{Name: q.Name, Type: q.Type, Class: 1, TTL: 60, Data: []byte{1, 2, 3, 4}}}}
}
func referral(zone string) wire.Message {
	return wire.Message{Flags: 0x8000, Authority: []wire.RR{{Name: zone, Type: wire.NS, Class: 1, TTL: 60, Target: "ns." + zone}}, Additional: []wire.RR{{Name: "ns." + zone, Type: wire.A, Class: 1, TTL: 60, Data: []byte{127, 0, 0, 2}}}}
}
func newResolver(f *fake) *Resolver {
	return &Resolver{Exchange: f, Cache: cache.New(16, time.Now), Roots: []string{"127.0.0.1:53"}, MaxSteps: 20, Clock: func() time.Time { return time.Unix(100, 0) }}
}

// @id TEST-RESOLVER-001 @verifies REQ-RESOLVER-001 REQ-RESOLVER-002
func TestTEST_RESOLVER_001(t *testing.T) {
	f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
		if q.Type == wire.NS {
			return referral(q.Name), nil
		}
		return positive(q), nil
	}}
	m, err := newResolver(f).Resolve(context.Background(), wire.Question{"www.example.com.", wire.A, 1})
	if err != nil || len(m.Answers) != 1 || len(f.calls) != 3 {
		t.Fatalf("resolution %v %#v calls %v", err, m, f.calls)
	}
	if f.calls[0].q.Name != "com." || f.calls[1].q.Name != "example.com." || f.calls[2].q.Name != "www.example.com." || f.calls[2].server != "127.0.0.2:53" {
		t.Fatal("not minimised", f.calls)
	}
	f = &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
		m := referral(q.Name)
		m.Authority[0].Target = "ns.evil."
		m.Additional[0].Name = "ns.evil."
		return m, nil
	}}
	if _, err := newResolver(f).Resolve(context.Background(), wire.Question{"www.example.com.", wire.A, 1}); err == nil {
		t.Fatal("out of bailiwick accepted")
	}
}

// @id TEST-RESOLVER-002 @verifies REQ-RESOLVER-003 REQ-RESOLVER-004
func TestTEST_RESOLVER_002(t *testing.T) {
	for _, neg := range []bool{false, true} {
		t.Run(fmt.Sprint(neg), func(t *testing.T) {
			f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
				m := positive(q)
				if neg {
					m.Answers = nil
					m.Flags = 0x8403
					m.Authority = []wire.RR{{Name: ".", Type: wire.SOAType, Class: 1, TTL: 30, SOA: &wire.SOA{MName: ".", RName: ".", Minimum: 10}}}
				}
				return m, nil
			}}
			r := newResolver(f)
			q := wire.Question{"example.", wire.A, 1}
			m, err := r.Resolve(context.Background(), q)
			if err != nil {
				t.Fatal(err)
			}
			_, err = r.Resolve(context.Background(), q)
			if err != nil || len(f.calls) != 1 || neg != (m.Flags&15 == 3) {
				t.Fatal("cache miss", f.calls, err)
			}
		})
	}
}

// @id TEST-RESOLVER-003 @verifies REQ-RESOLVER-005 REQ-RESOLVER-006
func TestTEST_RESOLVER_003(t *testing.T) {
	f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) { return referral("."), nil }}
	r := newResolver(f)
	if _, err := r.Resolve(context.Background(), wire.Question{"x.", wire.A, 1}); err == nil {
		t.Fatal("delegation loop accepted")
	}
	if len(f.calls) > 20 {
		t.Fatal("unbounded loop")
	}
	f = &fake{fn: func(s string, q wire.Question) (wire.Message, error) { return wire.Message{Flags: 0x8002}, nil }}
	r = newResolver(f)
	for i := 0; i < 2; i++ {
		if _, err := r.Resolve(context.Background(), wire.Question{"x.", wire.A, 1}); err == nil {
			t.Fatal("SERVFAIL accepted")
		}
	}
	if len(f.calls) != 2 {
		t.Fatal("SERVFAIL cached")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := r.Resolve(ctx, wire.Question{"x.", wire.A, 1}); err == nil {
		t.Fatal("cancelled accepted")
	}
}

// @id TEST-RESOLVER-004 @verifies REQ-RESOLVER-007 REQ-RESOLVER-008
func TestTEST_RESOLVER_004(t *testing.T) {
	f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
		if q.Name == "alias." {
			return wire.Message{Flags: 0x8400, Answers: []wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 30, Target: "target."}}}, nil
		}

		return positive(q), nil
	}}
	r := newResolver(f)
	m, err := r.Resolve(context.Background(), wire.Question{"alias.", wire.A, 1})
	if err != nil || len(m.Answers) != 1 || m.Answers[0].Name != "target." {
		t.Fatal("CNAME chase", m, err)
	}
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	v := dnssec.Validator{Anchors: map[string]dnssec.Anchor{"key": {Zone: ".", Key: pub}}, Clock: func() time.Time { return time.Unix(100, 0) }}
	r.Validator = &v
	if _, err := r.Resolve(context.Background(), wire.Question{"alias.", wire.A, 1}); err == nil {
		t.Fatal("unsigned cached or CNAME accepted")
	}
	q := wire.Question{"target.", wire.A, 1}
	p := dnssec.Proof{KeyID: "key", Zone: ".", Inception: 90, Expiry: 110, OriginalTTL: 60}
	b, _ := dnssec.Canonical(positive(q).Answers, p)
	p.Signature = ed25519.Sign(priv, b)
	f.proof = p
	f.signed = true
	if _, err := r.Resolve(context.Background(), q); err != nil {
		t.Fatal("valid secure answer", err)
	}
	v.Clock = func() time.Time { return time.Unix(110, 0) }
	if _, err := r.Resolve(context.Background(), q); err == nil {
		t.Fatal("expired secure cache accepted")
	}
	r.Validator = nil
	f.fn = func(s string, q wire.Question) (wire.Message, error) {
		return wire.Message{Flags: 0x8400, Answers: []wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 30, Target: q.Name}}}, nil
	}
	if _, err := r.Resolve(context.Background(), wire.Question{"loop.", wire.A, 1}); err == nil {
		t.Fatal("CNAME loop accepted")
	}
}

// @id TEST-RESOLVER-005 @verifies REQ-RESOLVER-003
func TestTEST_RESOLVER_005(t *testing.T) {
	now := time.Unix(100, 0)
	f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
		if q.Name == "alias." {
			return wire.Message{Flags: 0x8400, Answers: []wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 1, Target: "target."}}}, nil
		}
		return positive(q), nil
	}}
	r := newResolver(f)
	r.Cache = cache.New(16, func() time.Time { return now })
	q := wire.Question{"alias.", wire.A, 1}
	if _, err := r.Resolve(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Second)
	if _, err := r.Resolve(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	if len(f.calls) != 4 {
		t.Fatalf("CNAME TTL not honoured: %d calls", len(f.calls))
	}
}

// @id TEST-RESOLVER-006 @verifies REQ-RESOLVER-006 REQ-RESOLVER-008
func TestTEST_RESOLVER_006(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	q := wire.Question{"x.", wire.A, 1}
	m := positive(q)
	m.Flags |= 3
	p := dnssec.Proof{KeyID: "key", Zone: ".", Inception: 90, Expiry: 110, OriginalTTL: 60}
	b, _ := dnssec.Canonical(m.Answers, p)
	p.Signature = ed25519.Sign(priv, b)
	f := &fake{proof: p, signed: true, fn: func(s string, q wire.Question) (wire.Message, error) { return m, nil }}
	r := newResolver(f)
	r.Validator = &dnssec.Validator{Anchors: map[string]dnssec.Anchor{"key": {Zone: ".", Key: pub}}, Clock: func() time.Time { return time.Unix(100, 0) }}
	if _, err := r.Resolve(context.Background(), q); err == nil {
		t.Fatal("signed NXDOMAIN positive accepted")
	}
}

// @id TEST-RESOLVER-007 @verifies REQ-RESOLVER-007
func TestTEST_RESOLVER_007(t *testing.T) {
	f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
		m := positive(wire.Question{"target.", wire.A, 1})
		m.Answers = append([]wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 5, Target: "target."}}, m.Answers...)
		return m, nil
	}}
	m, err := newResolver(f).Resolve(context.Background(), wire.Question{"alias.", wire.A, 1})
	if err != nil || len(m.Answers) != 1 || m.Answers[0].Name != "target." || m.Answers[0].TTL != 5 || len(f.calls) != 1 {
		t.Fatalf("bundled CNAME %#v %v calls %d", m, err, len(f.calls))
	}
}

// @id TEST-RESOLVER-008 @verifies REQ-RESOLVER-003
func TestTEST_RESOLVER_008(t *testing.T) {
	now := time.Unix(100, 0)
	f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
		if q.Name == "alias." {
			return wire.Message{Flags: 0x8400, Answers: []wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 1, Target: "target."}}}, nil
		}
		return wire.Message{Flags: 0x8403, Authority: []wire.RR{{Name: ".", Type: wire.SOAType, Class: 1, TTL: 60, SOA: &wire.SOA{MName: ".", RName: ".", Minimum: 60}}}}, nil
	}}
	r := newResolver(f)
	r.Cache = cache.New(16, func() time.Time { return now })
	q := wire.Question{Name: "alias.", Type: wire.A, Class: 1}
	if _, err := r.Resolve(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Second)
	if _, err := r.Resolve(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	if len(f.calls) != 4 {
		t.Fatalf("negative alias TTL ignored: %d calls", len(f.calls))
	}
}

// @id TEST-RESOLVER-009 @verifies REQ-RESOLVER-008
func TestTEST_RESOLVER_009(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	q := wire.Question{Name: "x.", Type: wire.A, Class: 1}
	m := positive(q)
	p := dnssec.Proof{KeyID: "key", Zone: ".", Inception: 90, Expiry: 110, OriginalTTL: 60}
	b, _ := dnssec.Canonical(m.Answers, p)
	p.Signature = ed25519.Sign(priv, b)
	f := &fake{proof: p, signed: true, fn: func(s string, q wire.Question) (wire.Message, error) { return m, nil }}
	r := newResolver(f)
	r.Validator = &dnssec.Validator{Anchors: map[string]dnssec.Anchor{"key": {Zone: ".", Key: pub}}, Clock: func() time.Time { return time.Unix(100, 0) }}
	got, err := r.Resolve(context.Background(), q)
	if err != nil || len(got.Answers) != 1 || got.Answers[0].TTL != 10 {
		t.Fatalf("proof expiry TTL %#v %v", got, err)
	}
}

// @id TEST-RESOLVER-010 @verifies REQ-RESOLVER-008
func TestTEST_RESOLVER_010(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	now := int64(100)
	f := &fake{signed: true}
	f.fn = func(s string, q wire.Question) (wire.Message, error) {
		m := positive(q)
		expiry := int64(200)
		if q.Name == "alias." {
			expiry = 101
			m.Answers = []wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 30, Target: "target."}}
		} else {
			now = 102
		}
		p := dnssec.Proof{KeyID: "key", Zone: ".", Inception: 90, Expiry: expiry, OriginalTTL: 60}
		b, _ := dnssec.Canonical(m.Answers, p)
		p.Signature = ed25519.Sign(priv, b)
		f.proof = p
		return m, nil
	}
	r := newResolver(f)
	r.Validator = &dnssec.Validator{Anchors: map[string]dnssec.Anchor{"key": {Zone: ".", Key: pub}}, Clock: func() time.Time { return time.Unix(now, 0) }}
	if _, err := r.Resolve(context.Background(), wire.Question{Name: "alias.", Type: wire.A, Class: 1}); err == nil {
		t.Fatal("earlier CNAME proof expired before return")
	}
}

// @id TEST-RESOLVER-011 @verifies REQ-RESOLVER-003
func TestTEST_RESOLVER_011(t *testing.T) {
	for _, negative := range []bool{false, true} {
		t.Run(fmt.Sprint(negative), func(t *testing.T) {
			now := time.Unix(100, 0)
			f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
				if q.Name == "alias." {
					return wire.Message{Flags: 0x8400, Answers: []wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 1, Target: "target."}}}, nil
				}
				now = time.Unix(102, 0)
				if !negative {
					return positive(q), nil
				}
				return wire.Message{Flags: 0x8403, Authority: []wire.RR{{Name: ".", Type: wire.SOAType, Class: 1, TTL: 60, SOA: &wire.SOA{MName: ".", RName: ".", Minimum: 60}}}}, nil
			}}
			r := newResolver(f)
			r.Clock = func() time.Time { return now }
			r.Cache = cache.New(16, r.Clock)
			q := wire.Question{Name: "alias.", Type: wire.A, Class: 1}
			got, err := r.Resolve(context.Background(), q)
			if err != nil {
				t.Fatal(err)
			}
			if _, ok := r.Cache.Get(q); ok {
				t.Fatal("alias lifetime elapsed during traversal but result cached")
			}
			if !negative && got.Answers[0].TTL != 0 {
				t.Fatal("positive TTL retained elapsed alias lifetime")
			}
			if negative && got.Authority[0].TTL != 0 {
				t.Fatal("negative TTL retained elapsed alias lifetime")
			}
		})
	}
}

// @id TEST-RESOLVER-012 @verifies REQ-RESOLVER-003
func TestTEST_RESOLVER_012(t *testing.T) {
	now := time.Unix(100, 0)
	f := &fake{fn: func(s string, q wire.Question) (wire.Message, error) {
		if q.Name == "alias." {
			return wire.Message{Flags: 0x8400, Answers: []wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 1, Target: "target."}}}, nil
		}
		now = time.Unix(100, 500_000_000)
		return positive(q), nil
	}}
	r := newResolver(f)
	r.Clock = func() time.Time { return now }
	r.Cache = cache.New(16, r.Clock)
	q := wire.Question{Name: "alias.", Type: wire.A, Class: 1}
	m, err := r.Resolve(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if m.Answers[0].TTL != 0 {
		t.Fatal("fractional lifetime rounded upward")
	}
	if _, ok := r.Cache.Get(q); ok {
		t.Fatal("rounded TTL extended cache beyond CNAME deadline")
	}
}

// @id TEST-RESOLVER-013 @verifies REQ-RESOLVER-008
func TestTEST_RESOLVER_013(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Unix(100, 500_000_000)
	f := &fake{signed: true}
	f.fn = func(s string, q wire.Question) (wire.Message, error) {
		m := positive(q)
		expiry := int64(200)
		if q.Name == "alias." {
			expiry = 110
			m.Answers = []wire.RR{{Name: q.Name, Type: wire.CNAME, Class: 1, TTL: 30, Target: "target."}}
		} else {
			now = time.Unix(101, 200_000_000)
		}
		p := dnssec.Proof{KeyID: "key", Zone: ".", Inception: 90, Expiry: expiry, OriginalTTL: 60}
		b, _ := dnssec.Canonical(m.Answers, p)
		p.Signature = ed25519.Sign(priv, b)
		f.proof = p
		return m, nil
	}
	r := newResolver(f)
	r.Validator = &dnssec.Validator{Anchors: map[string]dnssec.Anchor{"key": {Zone: ".", Key: pub}}, Clock: func() time.Time { return now }}
	m, err := r.Resolve(context.Background(), wire.Question{Name: "alias.", Type: wire.A, Class: 1})
	if err != nil {
		t.Fatal(err)
	}
	if m.Answers[0].TTL != 8 {
		t.Fatalf("fractional proof lifetime extended: TTL=%d", m.Answers[0].TTL)
	}
}
