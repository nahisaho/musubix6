package dnssec

import (
	"bytes"
	"crypto/ed25519"
	"dogfood.local/dns/internal/name"
	"dogfood.local/dns/wire"
	"encoding/binary"
	"errors"
	"sort"
	"time"
)

type Proof struct {
	KeyID, Zone       string
	Inception, Expiry int64
	OriginalTTL       uint32
	Signature         []byte
}
type Anchor struct {
	Zone string
	Key  ed25519.PublicKey
}
type Validator struct {
	Anchors map[string]Anchor
	Clock   func() time.Time
}

// @id CODE-DNSSEC-001 @implements REQ-DNSSEC-001 REQ-DNSSEC-002 REQ-DNSSEC-003 REQ-DNSSEC-004 REQ-DNSSEC-005 REQ-DNSSEC-006 REQ-DNSSEC-007 REQ-DNSSEC-008
func Canonical(rr []wire.RR, p Proof) ([]byte, error) {
	if len(rr) == 0 {
		return nil, errors.New("empty signed records")
	}
	zone, err := name.Canonical(p.Zone)
	if err != nil {
		return nil, err
	}
	b := []byte("DNSSEC-LITE-v1")
	appendText := func(s string) { b = binary.BigEndian.AppendUint32(b, uint32(len(s))); b = append(b, s...) }
	appendText(p.KeyID)
	appendText(zone)
	b = binary.BigEndian.AppendUint64(b, uint64(p.Inception))
	b = binary.BigEndian.AppendUint64(b, uint64(p.Expiry))
	b = binary.BigEndian.AppendUint32(b, p.OriginalTTL)
	records := make([][]byte, 0, len(rr))
	for _, r := range rr {
		r.TTL = p.OriginalTTL
		raw, err := wire.Encode(wire.Message{Answers: []wire.RR{r}})
		if err != nil {
			return nil, err
		}
		records = append(records, raw)
	}
	sort.Slice(records, func(i, j int) bool { return bytes.Compare(records[i], records[j]) < 0 })
	b = binary.BigEndian.AppendUint32(b, uint32(len(records)))
	for _, r := range records {
		b = binary.BigEndian.AppendUint32(b, uint32(len(r)))
		b = append(b, r...)
	}
	return b, nil
}
func (v Validator) Verify(rr []wire.RR, p Proof) error {
	anchor, ok := v.Anchors[p.KeyID]
	if !ok || len(anchor.Key) != ed25519.PublicKeySize {
		return errors.New("unknown trust key")
	}
	zone, err := name.Canonical(p.Zone)
	if err != nil {
		return err
	}
	authorized, err := name.Canonical(anchor.Zone)
	if err != nil || authorized != zone {
		return errors.New("key not authorized for zone")
	}
	clock := v.Clock
	if clock == nil {
		clock = time.Now
	}
	now := clock().Unix()
	if now < p.Inception || now >= p.Expiry || p.Expiry <= p.Inception {
		return errors.New("invalid signature interval")
	}
	for _, r := range rr {
		if !name.Within(r.Name, zone) {
			return errors.New("signed owner outside zone")
		}
		if r.TTL > p.OriginalTTL {
			return errors.New("received TTL exceeds signed original TTL")
		}
	}
	b, err := Canonical(rr, p)
	if err != nil {
		return err
	}
	if len(p.Signature) != ed25519.SignatureSize || !ed25519.Verify(anchor.Key, b, p.Signature) {
		return errors.New("invalid signature")
	}
	return nil
}
