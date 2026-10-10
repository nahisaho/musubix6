package txn_test

import (
	"fmt"
	"strconv"
	"sync"
	"testing"

	"kvwatch/lease"
	"kvwatch/mvcc"
	"kvwatch/txn"
)

func setup() (*mvcc.Store, *lease.Manager, *txn.Engine) {
	s := mvcc.New()
	m := lease.NewManager(s, func() int64 { return 0 })
	return s, m, txn.New(s, m)
}

func put(k, v string) txn.Op { return txn.Op{Kind: txn.OpPut, Key: k, Value: v} }

func holds(t *testing.T, e *txn.Engine, c txn.Compare) bool {
	t.Helper()
	r, err := e.Do(txn.Txn{Compares: []txn.Compare{c}})
	if err != nil {
		t.Fatalf("compare %+v: %v", c, err)
	}
	return r.Succeeded
}

// @id TEST-TXN-001 @verifies REQ-TXN-001
func TestTEST_TXN_001_no_compares(t *testing.T) {
	s, _, e := setup()
	r, err := e.Do(txn.Txn{Then: []txn.Op{put("a", "1")}, Else: []txn.Op{put("b", "1")}})
	if err != nil || !r.Succeeded || r.Revision != 1 {
		t.Fatalf("r=%+v err=%v", r, err)
	}
	if _, ok, _ := s.Get("b", 0); ok {
		t.Fatal("else branch ran")
	}
}

// @id TEST-TXN-002 @verifies REQ-TXN-002
func TestTEST_TXN_002_all_compares_must_hold(t *testing.T) {
	s, _, e := setup()
	s.Put("a", "x", 0)
	s.Put("b", "y", 0)
	both := []txn.Compare{
		{Key: "a", Target: txn.TargetValue, Op: txn.Equal, Value: "x"},
		{Key: "b", Target: txn.TargetValue, Op: txn.Equal, Value: "y"},
	}
	r, _ := e.Do(txn.Txn{Compares: both, Then: []txn.Op{put("then", "1")}, Else: []txn.Op{put("else", "1")}})
	if !r.Succeeded {
		t.Fatal("expected then")
	}
	both[1].Value = "nope"
	r, _ = e.Do(txn.Txn{Compares: both, Then: []txn.Op{put("then2", "1")}, Else: []txn.Op{put("else", "1")}})
	if r.Succeeded {
		t.Fatal("one false compare must fail the txn")
	}
	if _, ok, _ := s.Get("else", 0); !ok {
		t.Fatal("else branch missing")
	}
	if _, ok, _ := s.Get("then2", 0); ok {
		t.Fatal("then branch ran")
	}
}

// @id TEST-TXN-003 @verifies REQ-TXN-003
func TestTEST_TXN_003_targets_and_operators(t *testing.T) {
	s, m, e := setup()
	l, _ := m.Grant(10)
	s.Put("a", "v1", 0)
	s.Put("b", "x", 0)
	m.Put("a", "v2", l) // a: create=1 mod=3 version=2
	cases := []struct {
		c    txn.Compare
		want bool
	}{
		{txn.Compare{Key: "a", Target: txn.TargetVersion, Op: txn.Equal, Int: 2}, true},
		{txn.Compare{Key: "a", Target: txn.TargetVersion, Op: txn.Greater, Int: 1}, true},
		{txn.Compare{Key: "a", Target: txn.TargetVersion, Op: txn.Less, Int: 2}, false},
		{txn.Compare{Key: "a", Target: txn.TargetVersion, Op: txn.NotEqual, Int: 2}, false},
		{txn.Compare{Key: "a", Target: txn.TargetCreate, Op: txn.Equal, Int: 1}, true},
		{txn.Compare{Key: "a", Target: txn.TargetMod, Op: txn.Equal, Int: 3}, true},
		{txn.Compare{Key: "a", Target: txn.TargetMod, Op: txn.Greater, Int: 3}, false},
		{txn.Compare{Key: "a", Target: txn.TargetValue, Op: txn.Equal, Value: "v2"}, true},
		{txn.Compare{Key: "a", Target: txn.TargetValue, Op: txn.Less, Value: "v3"}, true},
		{txn.Compare{Key: "a", Target: txn.TargetValue, Op: txn.Greater, Value: "v3"}, false},
		{txn.Compare{Key: "a", Target: txn.TargetLease, Op: txn.Equal, Int: l}, true},
		{txn.Compare{Key: "b", Target: txn.TargetLease, Op: txn.Equal, Int: 0}, true},
	}
	for i, c := range cases {
		if got := holds(t, e, c.c); got != c.want {
			t.Errorf("case %d %+v: got %v want %v", i, c.c, got, c.want)
		}
	}
}

// @id TEST-TXN-004 @verifies REQ-TXN-004
func TestTEST_TXN_004_missing_key(t *testing.T) {
	_, _, e := setup()
	for _, tg := range []txn.Target{txn.TargetVersion, txn.TargetCreate, txn.TargetMod, txn.TargetLease} {
		if !holds(t, e, txn.Compare{Key: "nope", Target: tg, Op: txn.Equal, Int: 0}) {
			t.Errorf("target %v: missing key should compare as 0", tg)
		}
		if holds(t, e, txn.Compare{Key: "nope", Target: tg, Op: txn.Greater, Int: 0}) {
			t.Errorf("target %v: missing key > 0", tg)
		}
	}
	for _, op := range []txn.Cmp{txn.Equal, txn.NotEqual, txn.Greater, txn.Less} {
		if holds(t, e, txn.Compare{Key: "nope", Target: txn.TargetValue, Op: op, Value: ""}) {
			t.Errorf("value compare op %v on missing key must be false", op)
		}
	}
}

// @id TEST-TXN-005 @verifies REQ-TXN-005
func TestTEST_TXN_005_single_revision(t *testing.T) {
	s, _, e := setup()
	s.Put("seed", "1", 0)
	r, err := e.Do(txn.Txn{Then: []txn.Op{put("a", "1"), put("b", "2"), {Kind: txn.OpDelete, Key: "seed"}}})
	if err != nil || r.Revision != 2 || s.Rev() != 2 {
		t.Fatalf("r=%+v err=%v rev=%d", r, err, s.Rev())
	}
	evs, _ := s.EventsSince(2)
	if len(evs) != 3 {
		t.Fatalf("events=%d", len(evs))
	}
	r, _ = e.Do(txn.Txn{Then: []txn.Op{{Kind: txn.OpGet, Key: "a"}}})
	if r.Revision != 2 || s.Rev() != 2 {
		t.Fatalf("read-only txn bumped revision: %+v rev=%d", r, s.Rev())
	}
	r, _ = e.Do(txn.Txn{})
	if r.Revision != 2 || s.Rev() != 2 {
		t.Fatalf("empty txn bumped revision: %+v", r)
	}
}

// @id TEST-TXN-006 @verifies REQ-TXN-006
func TestTEST_TXN_006_validation(t *testing.T) {
	s, _, e := setup()
	for name, ops := range map[string][]txn.Op{
		"put-put":    {put("a", "1"), put("a", "2")},
		"put-delete": {put("a", "1"), {Kind: txn.OpDelete, Key: "a"}},
		"del-put":    {{Kind: txn.OpDelete, Key: "a"}, put("a", "1")},
	} {
		if _, err := e.Do(txn.Txn{Then: ops}); err != txn.ErrDuplicateKey {
			t.Errorf("%s: err=%v", name, err)
		}
		if _, err := e.Do(txn.Txn{Compares: []txn.Compare{{Key: "z", Target: txn.TargetVersion, Op: txn.Equal}}, Then: nil, Else: ops}); err != txn.ErrDuplicateKey {
			t.Errorf("%s (unchosen/else branch): err=%v", name, err)
		}
	}
	if _, err := e.Do(txn.Txn{Compares: []txn.Compare{{Key: "a", Target: txn.Target(99)}}}); err != txn.ErrBadCompare {
		t.Fatalf("bad target err=%v", err)
	}
	if _, err := e.Do(txn.Txn{Compares: []txn.Compare{{Key: "a", Target: txn.TargetVersion, Op: txn.Cmp(99)}}}); err != txn.ErrBadCompare {
		t.Fatalf("bad op err=%v", err)
	}
	if s.Rev() != 0 {
		t.Fatalf("rejected txns changed state: rev=%d", s.Rev())
	}
}

// @id TEST-TXN-007 @verifies REQ-TXN-007
func TestTEST_TXN_007_snapshot_reads(t *testing.T) {
	s, _, e := setup()
	s.Put("a", "old", 0)
	r, err := e.Do(txn.Txn{Then: []txn.Op{{Kind: txn.OpGet, Key: "a"}, put("a", "new"), {Kind: txn.OpGet, Key: "a"}, {Kind: txn.OpGet, Key: "missing"}}})
	if err != nil || len(r.Results) != 4 {
		t.Fatalf("r=%+v err=%v", r, err)
	}
	if r.Results[0].KV == nil || r.Results[0].KV.Value != "old" || r.Results[2].KV == nil || r.Results[2].KV.Value != "old" {
		t.Fatalf("reads saw own writes: %+v", r.Results)
	}
	if r.Results[3].KV != nil {
		t.Fatalf("missing key returned %+v", r.Results[3].KV)
	}
	if kv, _, _ := s.Get("a", 0); kv.Value != "new" {
		t.Fatalf("write lost: %+v", kv)
	}
}

// @id TEST-TXN-008 @verifies REQ-TXN-008
func TestTEST_TXN_008_leases(t *testing.T) {
	s, m, e := setup()
	_, err := e.Do(txn.Txn{Then: []txn.Op{put("x", "1"), {Kind: txn.OpPut, Key: "y", Value: "1", Lease: 99}}})
	if err != lease.ErrLeaseNotFound || s.Rev() != 0 {
		t.Fatalf("err=%v rev=%d", err, s.Rev())
	}
	l, _ := m.Grant(10)
	if _, err := e.Do(txn.Txn{Then: []txn.Op{{Kind: txn.OpPut, Key: "k", Value: "1", Lease: l}}}); err != nil {
		t.Fatal(err)
	}
	if _, keys, _ := m.TimeToLive(l); fmt.Sprint(keys) != "[k]" {
		t.Fatalf("keys=%v", keys)
	}
	m.Revoke(l)
	if _, ok, _ := s.Get("k", 0); ok {
		t.Fatal("txn-leased key survived revoke")
	}
}

// @id TEST-TXN-009 @verifies REQ-TXN-009
func TestTEST_TXN_009_cas_counter(t *testing.T) {
	s, _, e := setup()
	s.Put("ctr", "0", 0)
	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 25; i++ {
				for {
					kv, _, _ := s.Get("ctr", 0)
					n, _ := strconv.Atoi(kv.Value)
					r, err := e.Do(txn.Txn{
						Compares: []txn.Compare{{Key: "ctr", Target: txn.TargetMod, Op: txn.Equal, Int: kv.ModRev}},
						Then:     []txn.Op{put("ctr", strconv.Itoa(n+1))},
					})
					if err != nil {
						t.Error(err)
						return
					}
					if r.Succeeded {
						break
					}
				}
			}
		}()
	}
	wg.Wait()
	kv, _, _ := s.Get("ctr", 0)
	if kv.Value != "200" || s.Rev() != 201 || kv.Version != 201 {
		t.Fatalf("value=%s rev=%d version=%d", kv.Value, s.Rev(), kv.Version)
	}
}
