package compact_test

import (
	"fmt"
	"testing"

	"kvwatch/compact"
	"kvwatch/mvcc"
	"kvwatch/watch"
)

func put(s *mvcc.Store, k, v string) {
	if _, err := s.Put(k, v, 0); err != nil {
		panic(err)
	}
}

func snapshot(s *mvcc.Store, rev int64) string {
	kvs, _, err := s.Range("a", "\x00", rev, 0)
	return fmt.Sprint(kvs, err)
}

// @id TEST-COMPACT-001 @verifies REQ-COMPACT-001
func TestTEST_COMPACT_001_state_preserved(t *testing.T) {
	s := mvcc.New()
	put(s, "a", "1")
	put(s, "b", "1")
	put(s, "a", "2")
	s.Delete("b")
	put(s, "c", "1")
	put(s, "b", "2")
	put(s, "a", "3")
	const target = 5
	wantHash, err := s.HashKV(target)
	if err != nil {
		t.Fatal(err)
	}
	want := map[int64]string{}
	for r := int64(target); r <= s.Rev(); r++ {
		want[r] = snapshot(s, r)
	}
	if _, err := s.Compact(target); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.HashKV(target); got != wantHash {
		t.Fatalf("hash changed %x -> %x", wantHash, got)
	}
	for r, w := range want {
		if got := snapshot(s, r); got != w {
			t.Fatalf("rev %d changed:\n%s\n%s", r, w, got)
		}
	}
}

// @id TEST-COMPACT-002 @verifies REQ-COMPACT-002
func TestTEST_COMPACT_002_keeps_latest_drops_tombstoned(t *testing.T) {
	s := mvcc.New()
	put(s, "a", "1") // 1
	put(s, "b", "1") // 2
	put(s, "a", "2") // 3
	s.Delete("b")    // 4
	put(s, "a", "3") // 5
	put(s, "c", "1") // 6
	if s.VersionCount() != 6 || s.KeyCount() != 3 {
		t.Fatalf("before: %d versions %d keys", s.VersionCount(), s.KeyCount())
	}
	removed, err := s.Compact(5)
	if err != nil || removed != 4 {
		t.Fatalf("removed=%d err=%v", removed, err)
	}
	if s.VersionCount() != 2 || s.KeyCount() != 2 {
		t.Fatalf("after: %d versions %d keys", s.VersionCount(), s.KeyCount())
	}
	if kv, ok, _ := s.Get("a", 5); !ok || kv.Value != "3" || kv.Version != 3 {
		t.Fatalf("a@5 = %+v %v", kv, ok)
	}
}

// @id TEST-COMPACT-003 @verifies REQ-COMPACT-003
func TestTEST_COMPACT_003_revision_checks(t *testing.T) {
	s := mvcc.New()
	for i := 0; i < 5; i++ {
		put(s, "a", fmt.Sprint(i))
	}
	if _, err := s.Compact(99); err != mvcc.ErrFutureRev {
		t.Fatalf("future: %v", err)
	}
	if _, err := s.Compact(3); err != nil {
		t.Fatal(err)
	}
	for _, r := range []int64{3, 2, 0} {
		if _, err := s.Compact(r); err != mvcc.ErrCompacted {
			t.Fatalf("Compact(%d) err=%v", r, err)
		}
	}
	if s.CompactRev() != 3 {
		t.Fatalf("compactRev=%d", s.CompactRev())
	}
	if _, err := s.Compact(5); err != nil || s.CompactRev() != 5 {
		t.Fatalf("compact to head: %v rev=%d", err, s.CompactRev())
	}
}

// @id TEST-COMPACT-004 @verifies REQ-COMPACT-004
func TestTEST_COMPACT_004_reads_below_compact_rev(t *testing.T) {
	s := mvcc.New()
	for i := 0; i < 4; i++ {
		put(s, "a", fmt.Sprint(i))
	}
	s.Compact(3)
	if _, _, err := s.Get("a", 2); err != mvcc.ErrCompacted {
		t.Fatalf("get@2 err=%v", err)
	}
	if _, _, err := s.Range("a", "\x00", 1, 0); err != mvcc.ErrCompacted {
		t.Fatalf("range@1 err=%v", err)
	}
	if kv, ok, err := s.Get("a", 3); err != nil || !ok || kv.Value != "2" {
		t.Fatalf("get@3 = %+v %v %v", kv, ok, err)
	}
	if _, _, err := s.Get("a", 0); err != nil {
		t.Fatalf("current read: %v", err)
	}
	if _, err := s.HashKV(2); err != mvcc.ErrCompacted {
		t.Fatalf("hash@2 err=%v", err)
	}
}

// @id TEST-COMPACT-005 @verifies REQ-COMPACT-005
func TestTEST_COMPACT_005_events_since(t *testing.T) {
	s := mvcc.New()
	for i := 0; i < 5; i++ {
		put(s, "a", fmt.Sprint(i))
	}
	s.Compact(3)
	for _, r := range []int64{0, 1, 3} {
		if _, err := s.EventsSince(r); err != mvcc.ErrCompacted {
			t.Fatalf("EventsSince(%d) err=%v", r, err)
		}
	}
	evs, err := s.EventsSince(4)
	if err != nil || len(evs) != 2 || evs[0].KV.ModRev != 4 {
		t.Fatalf("evs=%+v err=%v", evs, err)
	}
}

// @id TEST-COMPACT-006 @verifies REQ-COMPACT-006
func TestTEST_COMPACT_006_revision_retention(t *testing.T) {
	s := mvcc.New()
	c := compact.New(s, compact.Config{Mode: compact.ModeRevision, Retention: 3})
	for i := 0; i < 2; i++ {
		put(s, "a", "x")
	}
	if r, err := c.Run(); err != nil || r.Compacted {
		t.Fatalf("young store: %+v %v", r, err)
	}
	for i := 0; i < 8; i++ {
		put(s, "a", "x")
	}
	r, err := c.Run()
	if err != nil || !r.Compacted || r.Rev != 7 || s.CompactRev() != 7 {
		t.Fatalf("r=%+v err=%v", r, err)
	}
	if r, _ := c.Run(); r.Compacted {
		t.Fatalf("second run must be a no-op: %+v", r)
	}
	put(s, "a", "x")
	put(s, "a", "x")
	if r, _ := c.Run(); !r.Compacted || r.Rev != 9 {
		t.Fatalf("after growth: %+v", r)
	}
}

// @id TEST-COMPACT-007 @verifies REQ-COMPACT-007
func TestTEST_COMPACT_007_periodic(t *testing.T) {
	s := mvcc.New()
	c := compact.New(s, compact.Config{Mode: compact.ModePeriodic, Window: 60})
	steps := []struct {
		now, wantRev int64
		compacted    bool
	}{
		{0, 0, false},
		{30, 0, false},
		{60, 2, true},
		{100, 4, true},
		{110, 0, false},
	}
	for i, st := range steps {
		put(s, "a", "x")
		put(s, "a", "y")
		r, err := c.Tick(st.now)
		if err != nil || r.Compacted != st.compacted || (st.compacted && r.Rev != st.wantRev) {
			t.Fatalf("step %d now=%d: %+v err=%v want rev=%d compacted=%v", i, st.now, r, err, st.wantRev, st.compacted)
		}
	}
}

// @id TEST-COMPACT-008 @verifies REQ-COMPACT-008
func TestTEST_COMPACT_008_removed_count(t *testing.T) {
	s := mvcc.New()
	c := compact.New(s, compact.Config{Mode: compact.ModeRevision, Retention: 1})
	put(s, "a", "1")
	put(s, "a", "2")
	put(s, "a", "3")
	put(s, "b", "1")
	r, _ := c.Run()
	if !r.Compacted || r.Removed != 2 {
		t.Fatalf("first run %+v", r)
	}
	r, _ = c.Run()
	if r.Removed != 0 || r.Compacted {
		t.Fatalf("repeat run %+v", r)
	}
}

// @id TEST-COMPACT-009 @verifies REQ-COMPACT-009
func TestTEST_COMPACT_009_live_watcher(t *testing.T) {
	s := mvcc.New()
	h := watch.NewHub(s)
	st, _ := h.Watch("a", watch.Options{})
	for i := 0; i < 3; i++ {
		put(s, "a", "x")
	}
	s.Compact(2)
	put(s, "a", "y")
	s.Compact(4)
	put(s, "a", "z")
	var got []int64
	for {
		r, ok := st.TryNext()
		if !ok {
			break
		}
		got = append(got, r.Revision)
	}
	if fmt.Sprint(got) != "[1 2 3 4 5]" {
		t.Fatalf("stream %v", got)
	}
}

// @id TEST-COMPACT-010 @verifies REQ-COMPACT-010
func TestTEST_COMPACT_010_watch_compacted(t *testing.T) {
	s := mvcc.New()
	h := watch.NewHub(s)
	for i := 0; i < 5; i++ {
		put(s, "a", "x")
	}
	s.Compact(3)
	for _, start := range []int64{1, 3} {
		if _, err := h.Watch("a", watch.Options{StartRev: start}); err != mvcc.ErrCompacted {
			t.Fatalf("StartRev %d err=%v", start, err)
		}
	}
	if h.Watchers() != 0 {
		t.Fatalf("failed watch leaked: %d", h.Watchers())
	}
	st, err := h.Watch("a", watch.Options{StartRev: 4})
	if err != nil {
		t.Fatal(err)
	}
	if r, ok := st.TryNext(); !ok || r.Revision != 4 {
		t.Fatalf("replay from 4: %+v %v", r, ok)
	}
}
