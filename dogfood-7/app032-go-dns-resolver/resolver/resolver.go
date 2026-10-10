package resolver

import (
	"context"
	"dogfood.local/dns/cache"
	"dogfood.local/dns/dnssec"
	"dogfood.local/dns/internal/name"
	"dogfood.local/dns/wire"
	"errors"
	"net"
	"strings"
	"time"
)

type Exchanger interface {
	Exchange(context.Context, string, wire.Question) (wire.Message, error)
}
type ProofSource interface {
	Proof(wire.Message) (dnssec.Proof, bool)
}
type Resolver struct {
	Exchange  Exchanger
	Cache     *cache.Store
	Validator *dnssec.Validator
	Roots     []string
	MaxSteps  int
	Clock     func() time.Time
}

// @id CODE-RESOLVER-001 @implements REQ-RESOLVER-001 REQ-RESOLVER-002 REQ-RESOLVER-003 REQ-RESOLVER-004 REQ-RESOLVER-005 REQ-RESOLVER-006 REQ-RESOLVER-007 REQ-RESOLVER-008
func (r *Resolver) Resolve(ctx context.Context, q wire.Question) (wire.Message, error) {
	var empty wire.Message
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	n, err := name.Canonical(q.Name)
	if err != nil {
		return empty, err
	}
	q.Name = n
	if r.Exchange == nil || len(r.Roots) == 0 {
		return empty, errors.New("no upstream roots")
	}
	secure := r.Validator != nil
	clock := r.Clock
	if clock == nil {
		clock = time.Now
	}
	if secure && r.Validator.Clock != nil {
		clock = r.Validator.Clock
	}
	if !secure && r.Cache != nil {
		if m, ok := r.Cache.Get(q); ok {
			return m, nil
		}
	}
	original := q
	limit := r.MaxSteps
	if limit <= 0 {
		limit = 32
	}
	steps := 0
	seenNames := map[string]bool{}
	chainTTL := ^uint32(0)
	proofExpiry := int64(1<<63 - 1)
	var chainDeadline time.Time
	for {
		if seenNames[q.Name] {
			return empty, errors.New("CNAME loop")
		}
		seenNames[q.Name] = true
		server := r.Roots[0]
		zone := "."
		labels := strings.Split(strings.TrimSuffix(q.Name, "."), ".")
		queries := []wire.Question{}
		for i := len(labels) - 1; i > 0; i-- {
			queries = append(queries, wire.Question{Name: strings.Join(labels[i:], ".") + ".", Type: wire.NS, Class: q.Class})
		}
		queries = append(queries, q)
		chase := ""
		for index, query := range queries {
			for {
				if err := ctx.Err(); err != nil {
					return empty, err
				}
				steps++
				if steps > limit {
					return empty, errors.New("resolution budget exceeded")
				}
				m, err := r.Exchange.Exchange(ctx, server, query)
				if err != nil {
					return empty, err
				}
				code := m.Flags & 15
				if code != 0 && code != 3 {
					return empty, errors.New("upstream failure")
				}
				if code == 3 && len(m.Answers) > 0 {
					return empty, errors.New("NXDOMAIN carries positive answers")
				}
				if m.Flags&0x200 != 0 {
					return empty, errors.New("truncated upstream")
				}
				if len(m.Answers) > 0 {
					if m.Flags&0x400 == 0 {
						return empty, errors.New("non-authoritative answer")
					}
					terminal, target, ttl, err := reachable(m.Answers, query)
					if err != nil {
						return empty, err
					}
					if secure {
						source, ok := r.Exchange.(ProofSource)
						if !ok {
							return empty, errors.New("missing proof source")
						}
						p, ok := source.Proof(m)
						if !ok {
							return empty, errors.New("unsigned answer")
						}
						if err := r.Validator.Verify(m.Answers, p); err != nil {
							return empty, err
						}
						now := clock()
						if !now.Before(time.Unix(p.Expiry, 0)) {
							return empty, errors.New("proof expired during resolution")
						}
						if p.Expiry < proofExpiry {
							proofExpiry = p.Expiry
						}
						remaining := remainingTTL(time.Unix(p.Expiry, 0), now)
						if remaining < ttl {
							ttl = remaining
						}
					}
					if index < len(queries)-1 {
						if target != "" {
							return empty, errors.New("alias at minimisation boundary")
						}
						break
					}
					if ttl < chainTTL {
						chainTTL = ttl
					}
					deadline := clock().Add(time.Duration(ttl) * time.Second)
					if chainDeadline.IsZero() || deadline.Before(chainDeadline) {
						chainDeadline = deadline
					}
					chase = target
					if chase != "" {
						break
					}
					m.Questions = []wire.Question{original}
					m.Answers = terminal
					if remaining := remainingTTL(chainDeadline, clock()); remaining < chainTTL {
						chainTTL = remaining
					}
					if secure {
						now := clock()
						if !now.Before(time.Unix(proofExpiry, 0)) {
							return empty, errors.New("CNAME-chain proof expired before return")
						}
						remaining := remainingTTL(time.Unix(proofExpiry, 0), now)
						if remaining < chainTTL {
							chainTTL = remaining
						}
					}
					for i := range m.Answers {
						if m.Answers[i].TTL > chainTTL {
							m.Answers[i].TTL = chainTTL
						}
					}
					if !secure && r.Cache != nil {
						r.Cache.Put(original, m)
					}
					return m, nil
				}
				hasSOA := false
				for _, rr := range m.Authority {
					if rr.Type == wire.SOAType && rr.SOA != nil && name.Within(query.Name, rr.Name) {
						hasSOA = true
					}
				}
				if hasSOA && m.Flags&0x400 != 0 {
					if index < len(queries)-1 && code == 0 {
						break
					}
					if secure {
						return empty, errors.New("authenticated denial unsupported")
					}
					m.Questions = []wire.Question{original}
					if !chainDeadline.IsZero() {
						if remaining := remainingTTL(chainDeadline, clock()); remaining < chainTTL {
							chainTTL = remaining
						}
					}
					for i := range m.Authority {
						if m.Authority[i].Type == wire.SOAType && m.Authority[i].TTL > chainTTL {
							m.Authority[i].TTL = chainTTL
						}
					}
					if r.Cache != nil {
						r.Cache.Put(original, m)
					}
					return m, nil
				}
				if code == 3 {
					return empty, errors.New("non-authoritative NXDOMAIN")
				}
				next, newZone, err := glue(m, query, zone)
				if err != nil {
					return empty, err
				}
				server, zone = next, newZone
				if query.Type == wire.NS && query.Name == newZone && index < len(queries)-1 {
					break
				}
			}
			if chase != "" {
				break
			}
		}
		if chase == "" {
			return empty, errors.New("no answer")
		}
		q.Name = chase
	}
}

func remainingTTL(deadline, now time.Time) uint32 {
	d := deadline.Sub(now)
	if d <= 0 {
		return 0
	}
	seconds := uint64(d / time.Second)
	if seconds > uint64(^uint32(0)) {
		return ^uint32(0)
	}
	return uint32(seconds)
}

func reachable(records []wire.RR, q wire.Question) ([]wire.RR, string, uint32, error) {
	byOwner := map[string][]wire.RR{}
	ttl := ^uint32(0)
	for _, rr := range records {
		owner, err := name.Canonical(rr.Name)
		if err != nil || rr.Class != q.Class || (rr.Type != q.Type && rr.Type != wire.CNAME) {
			return nil, "", 0, errors.New("unrelated answer")
		}
		rr.Name = owner
		byOwner[owner] = append(byOwner[owner], rr)
		if rr.TTL < ttl {
			ttl = rr.TTL
		}
	}
	current := q.Name
	seen := map[string]bool{}
	consumed := 0
	for {
		if seen[current] {
			return nil, "", 0, errors.New("bundled CNAME loop")
		}
		seen[current] = true
		rrset := byOwner[current]
		if len(rrset) == 0 {
			if consumed != len(records) {
				return nil, "", 0, errors.New("unreachable bundled records")
			}
			return nil, current, ttl, nil
		}
		consumed += len(rrset)
		terminal := []wire.RR{}
		target := ""
		for _, rr := range rrset {
			if rr.Type == q.Type {
				terminal = append(terminal, rr)
				continue
			}
			n, err := name.Canonical(rr.Target)
			if err != nil {
				return nil, "", 0, err
			}
			if target != "" {
				return nil, "", 0, errors.New("multiple CNAME records")
			}
			target = n
		}
		if len(terminal) > 0 {
			if target != "" || consumed != len(records) {
				return nil, "", 0, errors.New("conflicting or unrelated terminal data")
			}
			return terminal, "", ttl, nil
		}
		if target == "" {
			return nil, "", 0, errors.New("empty CNAME target")
		}
		current = target
	}
}

func glue(m wire.Message, q wire.Question, previous string) (string, string, error) {
	for _, ns := range m.Authority {
		if ns.Type != wire.NS || ns.Class != q.Class {
			continue
		}
		zone, err := name.Canonical(ns.Name)
		if err != nil || zone == previous || !name.Within(zone, previous) || !name.Within(q.Name, zone) {
			continue
		}
		target, err := name.Canonical(ns.Target)
		if err != nil || !name.Within(target, zone) {
			continue
		}
		for _, a := range m.Additional {
			owner, err := name.Canonical(a.Name)
			if err != nil || owner != target || a.Class != q.Class {
				continue
			}
			if (a.Type == wire.A && len(a.Data) == 4) || (a.Type == wire.AAAA && len(a.Data) == 16) {
				return net.JoinHostPort(net.IP(a.Data).String(), "53"), zone, nil
			}
		}
	}
	return "", "", errors.New("no progressing in-bailiwick glue")
}
