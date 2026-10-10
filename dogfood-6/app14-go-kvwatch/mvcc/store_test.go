package mvcc_test

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"kvwatch/mvcc"
)

func mustPut(t *testing.T, s *mvcc.Store, k, v string) mvcc.KeyValue {
	t.Helper()
	kv, err := s.Put(k, v, 0)
	if err != nil {
		t.Fatalf("put %s: %v", k, err)
	}
	return kv
}

func keys(kvs []mvcc.KeyValue) []string {
	out := []string{}
	for _, kv := range kvs {
		out = append(out, kv.Key)
	}
	return out
}

// @id TEST-STORE-001 @verifies REQ-STORE-001
func TestTEST_STORE_001_put_new_key(t *testing.T) {
	s := mvcc.New()
	kv := mustPut(t, s, "a", "1")
	if s.Rev() != 1 || kv.CreateRev != 1 || kv.ModRev != 1 || kv.Version != 1 {
		t.Fatalf("got rev=%d kv=%+v", s.Rev(), kv)
	}
	mustPut(t, s, "b", "2")
	if s.Rev() != 2 {
		t.Fatalf("rev=%d", s.Rev())
	}
}

// @id TEST-STORE-002 @verifies REQ-STORE-002
func TestTEST_STORE_002_put_existing_key(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "a", "1")
	mustPut(t, s, "b", "x")
	kv := mustPut(t, s, "a", "2")
	if kv.CreateRev != 1 || kv.ModRev != 3 || kv.Version != 2 || kv.Value != "2" {
		t.Fatalf("kv=%+v", kv)
	}
}

// @id TEST-STORE-003 @verifies REQ-STORE-003
func TestTEST_STORE_003_get_current(t *testing.T) {
	s := mvcc.New()
	if _, ok, err := s.Get("a", 0); ok || err != nil {
		t.Fatalf("missing: ok=%v err=%v", ok, err)
	}
	mustPut(t, s, "a", "1")
	kv, ok, _ := s.Get("a", 0)
	if !ok || kv.Value != "1" {
		t.Fatalf("kv=%+v ok=%v", kv, ok)
	}
	s.Delete("a")
	if _, ok, _ := s.Get("a", 0); ok {
		t.Fatal("deleted key still visible")
	}
}

// @id TEST-STORE-004 @verifies REQ-STORE-004
func TestTEST_STORE_004_get_past_and_future(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "a", "1")
	mustPut(t, s, "a", "2")
	kv, ok, err := s.Get("a", 1)
	if err != nil || !ok || kv.Value != "1" {
		t.Fatalf("rev1: %+v %v %v", kv, ok, err)
	}
	if _, _, err := s.Get("a", 3); err != mvcc.ErrFutureRev {
		t.Fatalf("err=%v", err)
	}
}

// @id TEST-STORE-005 @verifies REQ-STORE-005
func TestTEST_STORE_005_delete(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "a", "1")
	d, err := s.Delete("a")
	if err != nil || !d || s.Rev() != 2 {
		t.Fatalf("d=%v err=%v rev=%d", d, err, s.Rev())
	}
	d, _ = s.Delete("a")
	d2, _ := s.Delete("zzz")
	if d || d2 || s.Rev() != 2 {
		t.Fatalf("absent delete changed state: %v %v rev=%d", d, d2, s.Rev())
	}
}

// @id TEST-STORE-006 @verifies REQ-STORE-006
func TestTEST_STORE_006_regeneration(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "a", "1")
	mustPut(t, s, "a", "2")
	s.Delete("a")
	kv := mustPut(t, s, "a", "3")
	if kv.Version != 1 || kv.CreateRev != 4 || kv.ModRev != 4 {
		t.Fatalf("kv=%+v", kv)
	}
}

// @id TEST-STORE-007 @verifies REQ-STORE-007
func TestTEST_STORE_007_range_bounds(t *testing.T) {
	s := mvcc.New()
	for _, k := range []string{"d", "a", "c", "b", "e"} {
		mustPut(t, s, k, k)
	}
	cases := []struct {
		start, end string
		want       string
	}{
		{"b", "d", "[b c]"},
		{"c", "", "[c]"},
		{"x", "", "[]"},
		{"c", "\x00", "[c d e]"},
		{"a", "\x00", "[a b c d e]"},
		{"d", "b", "[]"},
	}
	for _, c := range cases {
		kvs, _, err := s.Range(c.start, c.end, 0, 0)
		if err != nil || fmt.Sprint(keys(kvs)) != c.want {
			t.Fatalf("range(%q,%q)=%v err=%v want %s", c.start, c.end, keys(kvs), err, c.want)
		}
	}
}

// @id TEST-STORE-008 @verifies REQ-STORE-008
func TestTEST_STORE_008_range_limit(t *testing.T) {
	s := mvcc.New()
	for _, k := range []string{"a", "b", "c", "d"} {
		mustPut(t, s, k, k)
	}
	kvs, total, _ := s.Range("a", "\x00", 0, 2)
	if fmt.Sprint(keys(kvs)) != "[a b]" || total != 4 {
		t.Fatalf("kvs=%v total=%d", keys(kvs), total)
	}
	kvs, total, _ = s.Range("a", "\x00", 0, 10)
	if len(kvs) != 4 || total != 4 {
		t.Fatalf("kvs=%v total=%d", keys(kvs), total)
	}
}

// @id TEST-STORE-009 @verifies REQ-STORE-009
func TestTEST_STORE_009_range_past(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "a", "1") // rev1
	mustPut(t, s, "b", "1") // rev2
	s.Delete("a")           // rev3
	mustPut(t, s, "c", "1") // rev4
	for rev, want := range map[int64]string{1: "[a]", 2: "[a b]", 3: "[b]", 4: "[b c]"} {
		kvs, _, err := s.Range("a", "\x00", rev, 0)
		if err != nil || fmt.Sprint(keys(kvs)) != want {
			t.Fatalf("rev %d: %v err=%v want %s", rev, keys(kvs), err, want)
		}
	}
}

// @id TEST-STORE-010 @verifies REQ-STORE-010
func TestTEST_STORE_010_delete_range(t *testing.T) {
	s := mvcc.New()
	for _, k := range []string{"a", "b", "c"} {
		mustPut(t, s, k, k)
	}
	n, err := s.DeleteRange("a", "c")
	if err != nil || n != 2 || s.Rev() != 4 {
		t.Fatalf("n=%d err=%v rev=%d", n, err, s.Rev())
	}
	n, _ = s.DeleteRange("a", "c")
	if n != 0 || s.Rev() != 4 {
		t.Fatalf("empty delete range changed rev: n=%d rev=%d", n, s.Rev())
	}
}

// @id TEST-STORE-011 @verifies REQ-STORE-011
func TestTEST_STORE_011_empty_key(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "a", "1")
	if _, err := s.Put("", "x", 0); err != mvcc.ErrEmptyKey {
		t.Fatalf("put err=%v", err)
	}
	if _, err := s.Delete(""); err != mvcc.ErrEmptyKey {
		t.Fatalf("delete err=%v", err)
	}
	_, err := s.Apply(func(mvcc.Reader) []mvcc.Op {
		return []mvcc.Op{{Kind: mvcc.OpPut, Key: "b", Value: "1"}, {Kind: mvcc.OpPut, Key: "", Value: "2"}}
	})
	if err != mvcc.ErrEmptyKey || s.Rev() != 1 {
		t.Fatalf("apply err=%v rev=%d", err, s.Rev())
	}
	if _, ok, _ := s.Get("b", 0); ok {
		t.Fatal("partial batch applied")
	}
}

// @id TEST-STORE-012 @verifies REQ-STORE-012
func TestTEST_STORE_012_apply_batch(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "z", "0")
	res, err := s.ApplyOps([]mvcc.Op{
		{Kind: mvcc.OpPut, Key: "a", Value: "1"},
		{Kind: mvcc.OpPut, Key: "b", Value: "2"},
		{Kind: mvcc.OpDelete, Key: "nope"},
		{Kind: mvcc.OpDelete, Key: "a"},
	})
	if err != nil || res.Rev != 2 || s.Rev() != 2 {
		t.Fatalf("res=%+v err=%v", res, err)
	}
	if len(res.Events) != 3 {
		t.Fatalf("events=%d", len(res.Events))
	}
	want := []string{"a", "b", "a"}
	for i, e := range res.Events {
		if e.KV.Key != want[i] || e.KV.ModRev != 2 {
			t.Fatalf("event %d = %+v", i, e)
		}
	}
	if res.Events[2].Type != mvcc.EventDelete {
		t.Fatalf("third event type %v", res.Events[2].Type)
	}
}

// @id TEST-STORE-013 @verifies REQ-STORE-013
func TestTEST_STORE_013_events_since(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "a", "1")
	mustPut(t, s, "a", "2")
	s.Delete("a")
	evs, err := s.EventsSince(2)
	if err != nil || len(evs) != 2 {
		t.Fatalf("evs=%v err=%v", evs, err)
	}
	if evs[0].Type != mvcc.EventPut || evs[0].PrevKV == nil || evs[0].PrevKV.Version != 1 {
		t.Fatalf("put event %+v", evs[0])
	}
	d := evs[1]
	if d.Type != mvcc.EventDelete || d.KV.Value != "" || d.KV.ModRev != 3 || d.PrevKV == nil || d.PrevKV.Value != "2" {
		t.Fatalf("delete event %+v", d)
	}
	all, _ := s.EventsSince(1)
	if len(all) != 3 || all[0].PrevKV != nil {
		t.Fatalf("all=%+v", all)
	}
}

// @id TEST-STORE-014 @verifies REQ-STORE-014
func TestTEST_STORE_014_subscribers(t *testing.T) {
	s := mvcc.New()
	var got1, got2 [][]mvcc.Event
	s.Subscribe(func(e []mvcc.Event) { got1 = append(got1, e) })
	s.Subscribe(func(e []mvcc.Event) { got2 = append(got2, e) })
	mustPut(t, s, "a", "1")
	s.Delete("missing")
	s.ApplyOps([]mvcc.Op{{Kind: mvcc.OpPut, Key: "b", Value: "1"}, {Kind: mvcc.OpPut, Key: "c", Value: "1"}})
	if len(got1) != 2 || len(got2) != 2 {
		t.Fatalf("batches %d %d", len(got1), len(got2))
	}
	if len(got1[1]) != 2 || got1[0][0].KV.ModRev != 1 || got1[1][0].KV.ModRev != 2 {
		t.Fatalf("got1=%+v", got1)
	}
}

// @id TEST-STORE-015 @verifies REQ-STORE-015
func TestTEST_STORE_015_concurrent_revisions(t *testing.T) {
	s := mvcc.New()
	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				if _, err := s.Put(fmt.Sprintf("k%d-%d", g, i), "v", 0); err != nil {
					t.Error(err)
				}
			}
		}(g)
	}
	wg.Wait()
	if s.Rev() != 400 {
		t.Fatalf("rev=%d", s.Rev())
	}
	evs, _ := s.EventsSince(1)
	for i, e := range evs {
		if e.KV.ModRev != int64(i+1) {
			t.Fatalf("gap at %d: %d", i, e.KV.ModRev)
		}
	}
}

// @id TEST-STORE-016 @verifies REQ-STORE-016
func TestTEST_STORE_016_decide_panic_keeps_store_usable(t *testing.T) {
	s := mvcc.New()
	mustPut(t, s, "a", "1")
	func() {
		defer func() { _ = recover() }()
		s.Apply(func(mvcc.Reader) []mvcc.Op { panic("boom") })
	}()
	done := make(chan error, 1)
	go func() {
		_, err := s.Put("b", "2", 0)
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil || s.Rev() != 2 {
			t.Fatalf("err=%v rev=%d", err, s.Rev())
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("store deadlocked after decide panic")
	}
}
