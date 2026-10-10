package balance

import (
	mesh "dogfood.mesh"
	"fmt"
	"hash/fnv"
	"sync"
)

type Balancer struct {
	mu       sync.Mutex
	round    uint64
	weighted uint64
}

func New() *Balancer { return &Balancer{} }

// @id CODE-BALANCE-001 @implements REQ-BALANCE-001 REQ-BALANCE-002 REQ-BALANCE-003 REQ-BALANCE-004 REQ-BALANCE-005 REQ-BALANCE-006 REQ-BALANCE-007 REQ-BALANCE-008 REQ-BALANCE-009 REQ-BALANCE-010
func (b *Balancer) Pick(policy string, endpoints []mesh.Endpoint, key string, active map[string]int) (mesh.Endpoint, error) {
	es := mesh.Eligible(endpoints)
	if len(es) == 0 {
		return mesh.Endpoint{}, fmt.Errorf("no eligible endpoints")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	switch policy {
	case "round-robin":
		e := es[b.round%uint64(len(es))]
		b.round++
		return e, nil
	case "weighted":
		total := uint64(0)
		for _, e := range es {
			if e.Weight <= 0 || ^uint64(0)-total < uint64(e.Weight) {
				return mesh.Endpoint{}, fmt.Errorf("invalid weights")
			}
			total += uint64(e.Weight)
		}
		n := b.weighted % total
		b.weighted++
		for _, e := range es {
			if n < uint64(e.Weight) {
				return e, nil
			}
			n -= uint64(e.Weight)
		}
	case "least-request":
		best := es[0]
		for _, e := range es[1:] {
			if active[e.ID] < active[best.ID] {
				best = e
			}
		}
		return best, nil
	case "hash":
		best := es[0]
		var score uint64
		for i, e := range es {
			h := fnv.New64a()
			h.Write([]byte(key))
			h.Write([]byte{0})
			h.Write([]byte(e.ID))
			v := h.Sum64()
			if i == 0 || v > score || (v == score && e.ID < best.ID) {
				best, score = e, v
			}
		}
		return best, nil
	default:
		return mesh.Endpoint{}, fmt.Errorf("unknown policy %q", policy)
	}
	return mesh.Endpoint{}, fmt.Errorf("invalid weight sum")
}
