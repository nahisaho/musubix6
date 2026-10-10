package cache_test

import (
	"dogfood.local/controller/internal/cache"
	"dogfood.local/controller/model"
	"testing"
)

func obj(name string, version uint64) model.Object {
	return model.Object{Metadata: model.Metadata{Namespace: "ns", Name: name, Version: version}, Labels: map[string]string{"team": "a"}}
}

// @id TEST-CACHE-004
// @verifies REQ-CACHE-010
func TestTEST_CACHE_004_unseen_tombstone(t *testing.T) {
	s := cache.Objects()
	if !s.Delete("ns/missing", 10) {
		t.Fatal("unseen tombstone rejected")
	}
	if s.Upsert(obj("missing", 9)) {
		t.Fatal("late stale add resurrected deleted key")
	}
	if s.Delete("ns/missing", 9) {
		t.Fatal("stale tombstone accepted")
	}
	if !s.Upsert(obj("missing", 11)) {
		t.Fatal("new incarnation rejected")
	}
}

// @id TEST-CACHE-005
// @verifies REQ-CACHE-011
func TestTEST_CACHE_005_snapshot_event_barrier(t *testing.T) {
	for _, version := range []uint64{9, 10} {
		t.Run(string(rune('0'+version)), func(t *testing.T) {
			s := cache.Objects()
			if !s.Replace(nil, 10) {
				t.Fatal("snapshot rejected")
			}
			if s.Upsert(obj("late", version)) {
				t.Fatal("late add resurrected absent snapshot key")
			}
			s = cache.Objects()
			if !s.Replace([]model.Object{obj("held", 2)}, 10) {
				t.Fatal("snapshot rejected")
			}
			if s.Delete("ns/held", version) {
				t.Fatal("late delete removed authoritative snapshot key")
			}
			if s.Upsert(obj("held", version)) {
				t.Fatal("late update changed authoritative snapshot")
			}
			if !s.Upsert(obj("held", 11)) {
				t.Fatal("new post-snapshot event rejected")
			}
			if !s.Delete("ns/held", 12) {
				t.Fatal("new post-snapshot delete rejected")
			}
		})
	}
}

// @id TEST-CACHE-001
// @verifies REQ-CACHE-001 REQ-CACHE-002 REQ-CACHE-003
func TestTEST_CACHE_001_versions(t *testing.T) {
	s := cache.Objects()
	o := obj("a", 2)
	if !s.Upsert(o) {
		t.Fatal("initial insert rejected")
	}
	o.Labels["team"] = "input mutation"
	got, ok := s.Get("ns/a")
	if !ok || got.Labels["team"] != "a" {
		t.Fatal("input aliasing")
	}
	got.Labels["team"] = "output mutation"
	for _, tc := range []struct {
		version  uint64
		accepted bool
	}{{1, false}, {2, false}, {3, true}} {
		t.Run(string(rune('0'+tc.version)), func(t *testing.T) {
			if s.Upsert(obj("a", tc.version)) != tc.accepted {
				t.Fatalf("version %d", tc.version)
			}
		})
	}
	got, _ = s.Get("ns/a")
	if got.Version != 3 || got.Labels["team"] != "a" {
		t.Fatal("bad latest snapshot")
	}
}

// @id TEST-CACHE-002
// @verifies REQ-CACHE-004 REQ-CACHE-005 REQ-CACHE-006
func TestTEST_CACHE_002_deletion(t *testing.T) {
	s := cache.Objects()
	s.Upsert(obj("z", 5))
	s.Upsert(obj("a", 1))
	if s.Delete("ns/z", 4) {
		t.Fatal("stale delete accepted")
	}
	if !s.Delete("ns/z", 6) {
		t.Fatal("delete rejected")
	}
	if s.Upsert(obj("z", 5)) {
		t.Fatal("stale resurrection")
	}
	if !s.Upsert(obj("z", 7)) {
		t.Fatal("newer resurrection rejected")
	}
	list := s.List()
	if len(list) != 2 || list[0].Name != "a" || list[1].Name != "z" {
		t.Fatal("not sorted")
	}
}

// @id TEST-CACHE-003
// @verifies REQ-CACHE-007 REQ-CACHE-008 REQ-CACHE-009
func TestTEST_CACHE_003_relist(t *testing.T) {
	s := cache.Objects()
	s.Upsert(obj("old", 1))
	var events []string
	s.Watch(func(key string, o model.Object) {
		s.List()
		events = append(events, key)
		o.Labels["team"] = "watch mutation"
	})
	if !s.Replace([]model.Object{obj("b", 3), obj("a", 2)}, 4) {
		t.Fatal("snapshot rejected")
	}
	if s.Replace([]model.Object{obj("bad", 1)}, 3) {
		t.Fatal("stale relist accepted")
	}
	if _, ok := s.Get("ns/old"); ok {
		t.Fatal("old object retained")
	}
	if len(events) != 3 {
		t.Fatalf("events=%v", events)
	}
	if events[0] != "ns/a" || events[1] != "ns/b" || events[2] != "ns/old" {
		t.Fatal("event order")
	}
	got, _ := s.Get("ns/a")
	if got.Labels["team"] != "a" {
		t.Fatal("watch aliasing")
	}
	s.Upsert(obj("a", 10))
	if s.Replace([]model.Object{obj("a", 8)}, 8) {
		t.Fatal("relist rolled back a newer event")
	}
	s.Delete("ns/a", 11)
	if s.Replace([]model.Object{obj("a", 10)}, 10) {
		t.Fatal("relist ignored a newer tombstone")
	}
}
