package leader_test

import (
	"dogfood.local/controller/internal/clock"
	"dogfood.local/controller/internal/leader"
	"testing"
	"time"
)

// @id TEST-LEADER-001
// @verifies REQ-LEADER-001 REQ-LEADER-002 REQ-LEADER-003
func TestTEST_LEADER_001_acquire(t *testing.T) {
	e := leader.New(clock.NewFake())
	for _, tc := range []struct {
		name string
		ttl  time.Duration
	}{{"", time.Second}, {"a", 0}, {"a", -time.Second}} {
		t.Run(tc.name+tc.ttl.String(), func(t *testing.T) {
			if _, ok := e.Acquire(tc.name, tc.ttl); ok {
				t.Fatal("invalid lease accepted")
			}
		})
	}
	lease, ok := e.Acquire("a", time.Second)
	if !ok || lease.Holder != "a" || lease.Token == 0 {
		t.Fatal("initial lease")
	}
	if _, ok := e.Acquire("b", time.Second); ok {
		t.Fatal("double leader")
	}
}

// @id TEST-LEADER-002
// @verifies REQ-LEADER-004 REQ-LEADER-005 REQ-LEADER-006
func TestTEST_LEADER_002_renew(t *testing.T) {
	c := clock.NewFake()
	e := leader.New(c)
	l, _ := e.Acquire("a", time.Second)
	if e.Renew("b", l.Token, time.Second) || e.Renew("a", l.Token+1, time.Second) {
		t.Fatal("invalid renewal")
	}
	c.Advance(time.Second / 2)
	if !e.Renew("a", l.Token, time.Second) {
		t.Fatal("valid renewal denied")
	}
	c.Advance(time.Second)
	if e.Renew("a", l.Token, time.Second) {
		t.Fatal("expired renewal allowed")
	}
	if _, ok := e.Acquire("b", time.Second); !ok {
		t.Fatal("boundary failover denied")
	}
}

// @id TEST-LEADER-003
// @verifies REQ-LEADER-007 REQ-LEADER-008 REQ-LEADER-009
func TestTEST_LEADER_003_fencing(t *testing.T) {
	c := clock.NewFake()
	e := leader.New(c)
	a, _ := e.Acquire("a", time.Second)
	c.Advance(time.Second)
	b, _ := e.Acquire("b", time.Second)
	if b.Token <= a.Token {
		t.Fatal("token not increasing")
	}
	if e.Release("a", a.Token) {
		t.Fatal("stale release")
	}
	view := e.Snapshot()
	view.Holder = "intruder"
	if e.Snapshot().Holder != "b" || !e.Active("b", b.Token) {
		t.Fatal("mutable lease snapshot")
	}
	if !e.Release("b", b.Token) {
		t.Fatal("owner cannot release")
	}
	next, ok := e.Acquire("a", time.Second)
	if !ok || next.Token <= b.Token {
		t.Fatal("token reused after release")
	}
}
