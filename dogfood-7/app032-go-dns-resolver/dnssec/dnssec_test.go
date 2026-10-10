package dnssec

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"dogfood.local/dns/wire"
	"testing"
	"time"
)

func fixture(t *testing.T) (Validator, []wire.RR, Proof) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	v := Validator{map[string]Anchor{"key": {"example.", pub}}, func() time.Time { return time.Unix(100, 0) }}
	rr := []wire.RR{{Name: "a.example.", Type: wire.A, Class: 1, TTL: 30, Data: []byte{1, 2, 3, 4}}, {Name: "b.example.", Type: wire.A, Class: 1, TTL: 30, Data: []byte{5, 6, 7, 8}}}
	p := Proof{KeyID: "key", Zone: "example.", Inception: 90, Expiry: 110, OriginalTTL: 30}
	b, err := Canonical(rr, p)
	if err != nil {
		t.Fatal(err)
	}
	p.Signature = ed25519.Sign(priv, b)
	return v, rr, p
}

// @id TEST-DNSSEC-001 @verifies REQ-DNSSEC-001 REQ-DNSSEC-002
func TestTEST_DNSSEC_001(t *testing.T) {
	v, rr, p := fixture(t)
	if err := v.Verify(rr, p); err != nil {
		t.Fatal(err)
	}
	a, _ := Canonical(rr, p)
	b, _ := Canonical([]wire.RR{rr[1], rr[0]}, p)
	if len(a) == 0 || !bytes.Equal(a, b) {
		t.Fatal("canonical order differs or empty")
	}
}

// @id TEST-DNSSEC-002 @verifies REQ-DNSSEC-003 REQ-DNSSEC-004
func TestTEST_DNSSEC_002(t *testing.T) {
	v, rr, p := fixture(t)
	rr[0].Data[0] ^= 1
	if v.Verify(rr, p) == nil {
		t.Fatal("tampering accepted")
	}
	_, rr, p = fixture(t)
	p.KeyID = "other"
	if v.Verify(rr, p) == nil {
		t.Fatal("unknown key accepted")
	}
}

// @id TEST-DNSSEC-003 @verifies REQ-DNSSEC-005 REQ-DNSSEC-006
func TestTEST_DNSSEC_003(t *testing.T) {
	v, rr, p := fixture(t)
	for _, sec := range []int64{89, 110} {
		t.Run(time.Unix(sec, 0).String(), func(t *testing.T) {
			v.Clock = func() time.Time { return time.Unix(sec, 0) }
			if v.Verify(rr, p) == nil {
				t.Fatal("time interval accepted")
			}
		})
	}
	v.Clock = func() time.Time { return time.Unix(90, 0) }
	rr[0].TTL = 1
	rr[1].TTL = 0
	if err := v.Verify(rr, p); err != nil {
		t.Fatalf("aged TTL rejected: %v", err)
	}
}

// @id TEST-DNSSEC-004 @verifies REQ-DNSSEC-007 REQ-DNSSEC-008
func TestTEST_DNSSEC_004(t *testing.T) {
	v, rr, p := fixture(t)
	rr[0].Name = "notexample."
	if v.Verify(rr, p) == nil {
		t.Fatal("out of zone accepted")
	}
	_, rr, p = fixture(t)
	p.Zone = "."
	if v.Verify(rr, p) == nil {
		t.Fatal("unbound zone accepted")
	}
	p.Signature = nil
	if v.Verify(rr, p) == nil || v.Verify(nil, p) == nil {
		t.Fatal("malformed accepted")
	}
}

// @id TEST-DNSSEC-005 @verifies REQ-DNSSEC-006
func TestTEST_DNSSEC_005(t *testing.T) {
	v, rr, p := fixture(t)
	rr[0].TTL = p.OriginalTTL + 1
	if v.Verify(rr, p) == nil {
		t.Fatal("inflated signed TTL accepted")
	}
}
