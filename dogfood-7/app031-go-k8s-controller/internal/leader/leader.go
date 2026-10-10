package leader

import (
	"dogfood.local/controller/internal/clock"
	"errors"
	"sync"
	"time"
)

type Lease struct {
	Holder  string
	Token   uint64
	Expires time.Time
}
type Elector struct {
	mu    sync.Mutex
	clock clock.Clock
	lease Lease
	next  uint64
}

var ErrLeadership = errors.New("leadership lost")

func (e *Elector) WithFence(holder string, token uint64, action func() error) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.active(holder, token) {
		return ErrLeadership
	}
	return action()
}

func New(c clock.Clock) *Elector { return &Elector{clock: c} }

// @id CODE-LEADER-001
// @implements REQ-LEADER-001 REQ-LEADER-002 REQ-LEADER-003 REQ-LEADER-004 REQ-LEADER-005 REQ-LEADER-006 REQ-LEADER-007 REQ-LEADER-008 REQ-LEADER-009
func (e *Elector) Acquire(holder string, ttl time.Duration) (Lease, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	now := e.clock.Now()
	if holder == "" || ttl <= 0 || e.lease.Holder != "" && now.Before(e.lease.Expires) {
		return Lease{}, false
	}
	e.next++
	e.lease = Lease{Holder: holder, Token: e.next, Expires: now.Add(ttl)}
	return e.lease, true
}
func (e *Elector) Renew(holder string, token uint64, ttl time.Duration) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if ttl <= 0 || !e.active(holder, token) {
		return false
	}
	e.lease.Expires = e.clock.Now().Add(ttl)
	return true
}
func (e *Elector) Release(holder string, token uint64) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if holder == "" || e.lease.Holder != holder || e.lease.Token != token {
		return false
	}
	e.lease = Lease{}
	return true
}
func (e *Elector) Snapshot() Lease {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.lease
}
func (e *Elector) Active(holder string, token uint64) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.active(holder, token)
}
func (e *Elector) active(holder string, token uint64) bool {
	return holder != "" && e.lease.Holder == holder && e.lease.Token == token && e.clock.Now().Before(e.lease.Expires)
}
