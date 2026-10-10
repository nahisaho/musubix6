package watch_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"kvwatch/mvcc"
	"kvwatch/watch"
)

func setup() (*mvcc.Store, *watch.Hub) {
	s := mvcc.New()
	return s, watch.NewHub(s)
}

func put(t *testing.T, s *mvcc.Store, k, v string) {
	t.Helper()
	if _, err := s.Put(k, v, 0); err != nil {
		t.Fatal(err)
	}
}

func drain(st *watch.Stream) []watch.Response {
	var out []watch.Response
	for {
		r, ok := st.TryNext()
		if !ok {
			return out
		}
		out = append(out, r)
	}
}

func revs(rs []watch.Response) string {
	out := []int64{}
	for _, r := range rs {
		out = append(out, r.Revision)
	}
	return fmt.Sprint(out)
}

// @id TEST-WATCH-001 @verifies REQ-WATCH-001
func TestTEST_WATCH_001_future_events_only(t *testing.T) {
	s, h := setup()
	put(t, s, "a", "old")
	st, err := h.Watch("a", watch.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if got := drain(st); len(got) != 0 {
		t.Fatalf("history leaked: %+v", got)
	}
	put(t, s, "a", "new")
	got := drain(st)
	if len(got) != 1 || got[0].Revision != 2 || got[0].Events[0].KV.Value != "new" {
		t.Fatalf("got %+v", got)
	}
}

// @id TEST-WATCH-002 @verifies REQ-WATCH-002
func TestTEST_WATCH_002_replay_then_live(t *testing.T) {
	s, h := setup()
	put(t, s, "a", "1")
	put(t, s, "b", "1")
	put(t, s, "a", "2")
	s.Delete("a")
	st, _ := h.Watch("a", watch.Options{StartRev: 2})
	put(t, s, "a", "3")
	if got := revs(drain(st)); got != "[3 4 5]" {
		t.Fatalf("revisions %s", got)
	}

	s2, h2 := setup()
	st2, err := h2.Watch("k", watch.Options{StartRev: 1, QueueLimit: 10000})
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 300; i++ {
			s2.Put("k", fmt.Sprint(i), 0)
		}
	}()
	late := make(chan *watch.Stream, 1)
	go func() {
		st, _ := h2.Watch("k", watch.Options{StartRev: 1, QueueLimit: 10000})
		late <- st
	}()
	wg.Wait()
	for _, st := range []*watch.Stream{st2, <-late} {
		next := int64(1)
		for _, r := range drain(st) {
			if r.Revision != next {
				t.Fatalf("gap/dup: got %d want %d", r.Revision, next)
			}
			next++
		}
		if next != 301 {
			t.Fatalf("stopped at %d", next)
		}
	}
}

// @id TEST-WATCH-003 @verifies REQ-WATCH-003
func TestTEST_WATCH_003_range_and_prefix(t *testing.T) {
	s, h := setup()
	st, _ := h.Watch("b", watch.Options{End: "d"})
	for _, k := range []string{"a", "b", "c", "d", "bb"} {
		put(t, s, k, "x")
	}
	var ks []string
	for _, r := range drain(st) {
		ks = append(ks, r.Events[0].KV.Key)
	}
	if fmt.Sprint(ks) != "[b c bb]" {
		t.Fatalf("keys %v", ks)
	}
	cases := map[string]string{"a/": "a0", "ab\xff": "ac", "\xff\xff": "\x00", "": "\x00"}
	for in, want := range cases {
		if got := watch.PrefixEnd(in); got != want {
			t.Fatalf("PrefixEnd(%q)=%q want %q", in, got, want)
		}
	}
	pst, _ := h.Watch("p/", watch.Options{End: watch.PrefixEnd("p/")})
	put(t, s, "p/1", "x")
	put(t, s, "q/1", "x")
	put(t, s, "p0", "x")
	if got := drain(pst); len(got) != 1 || got[0].Events[0].KV.Key != "p/1" {
		t.Fatalf("prefix got %+v", got)
	}
}

// @id TEST-WATCH-004 @verifies REQ-WATCH-004
func TestTEST_WATCH_004_batched_by_revision(t *testing.T) {
	s, h := setup()
	st, _ := h.Watch("a", watch.Options{End: "\x00"})
	s.ApplyOps([]mvcc.Op{{Kind: mvcc.OpPut, Key: "a", Value: "1"}, {Kind: mvcc.OpPut, Key: "b", Value: "1"}, {Kind: mvcc.OpPut, Key: "c", Value: "1"}})
	put(t, s, "a", "2")
	got := drain(st)
	if len(got) != 2 || len(got[0].Events) != 3 || got[0].Revision != 1 || len(got[1].Events) != 1 {
		t.Fatalf("got %+v", got)
	}
}

// @id TEST-WATCH-005 @verifies REQ-WATCH-005
func TestTEST_WATCH_005_filters(t *testing.T) {
	s, h := setup()
	noPut, _ := h.Watch("a", watch.Options{NoPut: true})
	noDel, _ := h.Watch("a", watch.Options{NoDelete: true})
	put(t, s, "a", "1")
	if len(drain(noPut)) != 0 {
		t.Fatal("empty response sent to NoPut watcher")
	}
	s.Delete("a")
	p, d := drain(noPut), drain(noDel)
	if len(p) != 1 || p[0].Events[0].Type != mvcc.EventDelete {
		t.Fatalf("noPut got %+v", p)
	}
	if len(d) != 1 || d[0].Events[0].Type != mvcc.EventPut {
		t.Fatalf("noDel got %+v", d)
	}
}

// @id TEST-WATCH-006 @verifies REQ-WATCH-006
func TestTEST_WATCH_006_prev_kv(t *testing.T) {
	s, h := setup()
	with, _ := h.Watch("a", watch.Options{PrevKV: true})
	without, _ := h.Watch("a", watch.Options{})
	put(t, s, "a", "1")
	put(t, s, "a", "2")
	w, wo := drain(with), drain(without)
	if w[0].Events[0].PrevKV != nil || w[1].Events[0].PrevKV == nil || w[1].Events[0].PrevKV.Value != "1" {
		t.Fatalf("with prev: %+v", w)
	}
	if wo[1].Events[0].PrevKV != nil {
		t.Fatalf("PrevKV leaked: %+v", wo[1].Events[0])
	}
}

// @id TEST-WATCH-007 @verifies REQ-WATCH-007
func TestTEST_WATCH_007_cancel(t *testing.T) {
	s, h := setup()
	st, _ := h.Watch("a", watch.Options{})
	put(t, s, "a", "1")
	put(t, s, "a", "2")
	st.Cancel()
	st.Cancel()
	put(t, s, "a", "3")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	for i := int64(1); i <= 2; i++ {
		r, err := st.Next(ctx)
		if err != nil || r.Revision != i {
			t.Fatalf("queued %d: %+v %v", i, r, err)
		}
	}
	if _, err := st.Next(ctx); err != watch.ErrCanceled {
		t.Fatalf("err=%v", err)
	}
	if h.Watchers() != 0 {
		t.Fatalf("watchers=%d", h.Watchers())
	}
}

// @id TEST-WATCH-008 @verifies REQ-WATCH-008
func TestTEST_WATCH_008_future_start(t *testing.T) {
	s, h := setup()
	put(t, s, "a", "0")
	st, err := h.Watch("a", watch.Options{StartRev: 4})
	if err != nil {
		t.Fatal(err)
	}
	put(t, s, "a", "1")
	put(t, s, "a", "2")
	if got := drain(st); len(got) != 0 {
		t.Fatalf("early events %+v", got)
	}
	put(t, s, "a", "3")
	put(t, s, "a", "4")
	if got := revs(drain(st)); got != "[4 5]" {
		t.Fatalf("revisions %s", got)
	}
}

// @id TEST-WATCH-009 @verifies REQ-WATCH-009
func TestTEST_WATCH_009_progress(t *testing.T) {
	s, h := setup()
	a, _ := h.Watch("a", watch.Options{})
	b, _ := h.Watch("zzz", watch.Options{})
	c, _ := h.Watch("a", watch.Options{})
	c.Cancel()
	put(t, s, "q", "1")
	put(t, s, "q", "2")
	h.Progress()
	for _, st := range []*watch.Stream{a, b} {
		got := drain(st)
		if len(got) != 1 || got[0].Revision != 2 || len(got[0].Events) != 0 {
			t.Fatalf("progress got %+v", got)
		}
	}
	if got := drain(c); len(got) != 0 {
		t.Fatalf("cancelled stream got progress %+v", got)
	}
}

// @id TEST-WATCH-010 @verifies REQ-WATCH-010
func TestTEST_WATCH_010_slow_watcher_and_ids(t *testing.T) {
	s, h := setup()
	slow, _ := h.Watch("a", watch.Options{QueueLimit: 2})
	other, _ := h.Watch("a", watch.Options{})
	if !(slow.ID() > 0 && other.ID() > slow.ID()) {
		t.Fatalf("ids %d %d", slow.ID(), other.ID())
	}
	for i := 0; i < 3; i++ {
		put(t, s, "a", fmt.Sprint(i))
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	for i := 0; i < 2; i++ {
		if _, err := slow.Next(ctx); err != nil {
			t.Fatalf("queued %d: %v", i, err)
		}
	}
	if _, err := slow.Next(ctx); err != watch.ErrSlowWatcher {
		t.Fatalf("err=%v", err)
	}
	if len(drain(other)) != 3 {
		t.Fatal("healthy watcher affected")
	}
}
