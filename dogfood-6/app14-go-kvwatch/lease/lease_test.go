package lease_test

import (
	"fmt"
	"testing"

	"kvwatch/lease"
	"kvwatch/mvcc"
)

func setup() (*mvcc.Store, *lease.Manager, *int64) {
	s := mvcc.New()
	now := new(int64)
	return s, lease.NewManager(s, func() int64 { return *now }), now
}

func grant(t *testing.T, m *lease.Manager, ttl int64) int64 {
	t.Helper()
	id, err := m.Grant(ttl)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func live(s *mvcc.Store) string {
	kvs, _, _ := s.Range("a", "\x00", 0, 0)
	out := []string{}
	for _, kv := range kvs {
		out = append(out, kv.Key)
	}
	return fmt.Sprint(out)
}

// @id TEST-LEASE-001 @verifies REQ-LEASE-001
func TestTEST_LEASE_001_grant(t *testing.T) {
	_, m, _ := setup()
	if _, err := m.Grant(lease.MinTTL - 1); err != lease.ErrTTLTooSmall {
		t.Fatalf("err=%v", err)
	}
	a, b := grant(t, m, lease.MinTTL), grant(t, m, 10)
	if a <= 0 || b <= a {
		t.Fatalf("ids %d %d", a, b)
	}
}

// @id TEST-LEASE-002 @verifies REQ-LEASE-002
func TestTEST_LEASE_002_put_with_lease(t *testing.T) {
	s, m, _ := setup()
	id := grant(t, m, 10)
	kv, err := m.Put("a", "1", id)
	if err != nil || kv.Lease != id {
		t.Fatalf("kv=%+v err=%v", kv, err)
	}
	if _, err := m.Put("b", "1", 99); err != lease.ErrLeaseNotFound {
		t.Fatalf("err=%v", err)
	}
	if s.Rev() != 1 || live(s) != "[a]" {
		t.Fatalf("store changed: rev=%d %s", s.Rev(), live(s))
	}
	if _, err := m.Put("c", "1", 0); err != nil {
		t.Fatal(err)
	}
}

// @id TEST-LEASE-003 @verifies REQ-LEASE-003
func TestTEST_LEASE_003_revoke_single_revision(t *testing.T) {
	s, m, _ := setup()
	id := grant(t, m, 10)
	m.Put("a", "1", id)
	m.Put("b", "1", id)
	m.Put("c", "1", 0)
	if err := m.Revoke(id); err != nil {
		t.Fatal(err)
	}
	if s.Rev() != 4 || live(s) != "[c]" {
		t.Fatalf("rev=%d live=%s", s.Rev(), live(s))
	}
	evs, _ := s.EventsSince(4)
	if len(evs) != 2 {
		t.Fatalf("events %d", len(evs))
	}
	if err := m.Revoke(id); err != lease.ErrLeaseNotFound {
		t.Fatalf("second revoke err=%v", err)
	}
	if err := m.Revoke(77); err != lease.ErrLeaseNotFound {
		t.Fatalf("unknown revoke err=%v", err)
	}
}

// @id TEST-LEASE-004 @verifies REQ-LEASE-004
func TestTEST_LEASE_004_revoke_without_live_keys(t *testing.T) {
	s, m, _ := setup()
	id := grant(t, m, 10)
	m.Put("a", "1", id)
	s.Delete("a")
	before := s.Rev()
	if err := m.Revoke(id); err != nil || s.Rev() != before {
		t.Fatalf("err=%v rev %d->%d", err, before, s.Rev())
	}
	empty := grant(t, m, 10)
	if err := m.Revoke(empty); err != nil || s.Rev() != before {
		t.Fatalf("empty revoke err=%v rev=%d", err, s.Rev())
	}
}

// @id TEST-LEASE-005 @verifies REQ-LEASE-005
func TestTEST_LEASE_005_keepalive(t *testing.T) {
	_, m, now := setup()
	*now = 100
	id := grant(t, m, 10)
	*now = 105
	ttl, err := m.KeepAlive(id)
	if err != nil || ttl != 10 {
		t.Fatalf("ttl=%d err=%v", ttl, err)
	}
	rem, _, _ := m.TimeToLive(id)
	if rem != 10 {
		t.Fatalf("remaining %d", rem)
	}
	*now = 112
	if rem, _, _ := m.TimeToLive(id); rem != 3 {
		t.Fatalf("remaining %d", rem)
	}
	if _, err := m.KeepAlive(55); err != lease.ErrLeaseNotFound {
		t.Fatalf("err=%v", err)
	}
}

// @id TEST-LEASE-006 @verifies REQ-LEASE-006
func TestTEST_LEASE_006_expire_order(t *testing.T) {
	s, m, now := setup()
	a := grant(t, m, 10) // expires 10
	b := grant(t, m, 5)  // expires 5
	c := grant(t, m, 5)  // expires 5, larger id
	d := grant(t, m, 100)
	m.Put("a", "1", a)
	m.Put("b", "1", b)
	m.Put("c", "1", c)
	m.Put("d", "1", d)
	*now = 4
	if got := m.Expire(4); len(got) != 0 {
		t.Fatalf("early expire %v", got)
	}
	got := m.Expire(10)
	if fmt.Sprint(got) != fmt.Sprint([]int64{b, c, a}) {
		t.Fatalf("order %v want %v", got, []int64{b, c, a})
	}
	if live(s) != "[d]" || s.Rev() != 7 {
		t.Fatalf("live=%s rev=%d", live(s), s.Rev())
	}
	if m.Exists(a) || !m.Exists(d) {
		t.Fatal("lease table wrong")
	}
}

// @id TEST-LEASE-007 @verifies REQ-LEASE-007
func TestTEST_LEASE_007_no_resurrection(t *testing.T) {
	s, m, now := setup()
	id := grant(t, m, 5)
	m.Put("a", "1", id)
	*now = 5
	if _, err := m.KeepAlive(id); err != lease.ErrLeaseExpired {
		t.Fatalf("err=%v", err)
	}
	if got := m.Expire(5); fmt.Sprint(got) != fmt.Sprint([]int64{id}) {
		t.Fatalf("expire %v", got)
	}
	if live(s) != "[]" {
		t.Fatalf("live=%s", live(s))
	}
}

// @id TEST-LEASE-008 @verifies REQ-LEASE-008
func TestTEST_LEASE_008_reattach(t *testing.T) {
	s, m, _ := setup()
	l1, l2 := grant(t, m, 10), grant(t, m, 10)
	m.Put("a", "1", l1)
	m.Put("a", "2", l2)
	m.Revoke(l1)
	if live(s) != "[a]" {
		t.Fatalf("key lost on old lease revoke: %s", live(s))
	}
	if _, keys, _ := m.TimeToLive(l2); fmt.Sprint(keys) != "[a]" {
		t.Fatalf("keys %v", keys)
	}
	m.Put("a", "3", l2)
	if _, keys, _ := m.TimeToLive(l2); fmt.Sprint(keys) != "[a]" {
		t.Fatalf("dup attach %v", keys)
	}
	m.Put("a", "4", 0)
	m.Revoke(l2)
	if live(s) != "[a]" {
		t.Fatalf("detached key deleted: %s", live(s))
	}
}

// @id TEST-LEASE-009 @verifies REQ-LEASE-009
func TestTEST_LEASE_009_time_to_live(t *testing.T) {
	s, m, now := setup()
	*now = 50
	id := grant(t, m, 30)
	m.Put("c", "1", id)
	m.Put("a", "1", id)
	m.Put("b", "1", id)
	s.Delete("b")
	*now = 60
	rem, keys, err := m.TimeToLive(id)
	if err != nil || rem != 20 || fmt.Sprint(keys) != "[a c]" {
		t.Fatalf("rem=%d keys=%v err=%v", rem, keys, err)
	}
	if _, _, err := m.TimeToLive(404); err != lease.ErrLeaseNotFound {
		t.Fatalf("err=%v", err)
	}
}

// @id TEST-LEASE-010 @verifies REQ-LEASE-010
func TestTEST_LEASE_010_put_on_expired_pending_lease(t *testing.T) {
	s, m, now := setup()
	id := grant(t, m, 5)
	*now = 5
	if _, err := m.Put("a", "1", id); err != lease.ErrLeaseExpired {
		t.Fatalf("err=%v", err)
	}
	if s.Rev() != 0 {
		t.Fatalf("store changed: rev=%d", s.Rev())
	}
	*now = 4
	other := grant(t, m, 5)
	if _, err := m.Put("a", "1", other); err != nil {
		t.Fatalf("live lease rejected: %v", err)
	}
}
