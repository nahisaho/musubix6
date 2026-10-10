package compact

import (
	"dogfood/lsm/memtable"
	"dogfood/lsm/store"
	"os"
	"path/filepath"
	"testing"
)

func r(k string, s uint64, v string, del bool) memtable.Record {
	return memtable.Record{Key: k, Seq: s, Value: []byte(v), Deleted: del}
}

// @id TEST-COMPACT-001 @verifies REQ-COMPACT-001
func TestTEST_COMPACT_001(t *testing.T) {
	rs := Merge([][]memtable.Record{{r("b", 1, "b", false), r("a", 1, "old", false)}, {r("a", 3, "new", false)}})
	if len(rs) != 3 || rs[0].Key != "a" || rs[0].Seq != 3 || rs[1].Seq != 1 || rs[2].Key != "b" {
		t.Fatal("merge versions")
	}
}

// @id TEST-COMPACT-002 @verifies REQ-COMPACT-002
func TestTEST_COMPACT_002(t *testing.T) {
	rs := Merge([][]memtable.Record{{r("a", 1, "old", false)}, {r("a", 2, "", true)}})
	m := memtable.New()
	for _, v := range rs {
		m.Put(v)
	}
	old, ok := m.Get("a", 1)
	if !ok || string(old.Value) != "old" {
		t.Fatal("old snapshot")
	}
	if _, ok = m.Get("a", 2); ok {
		t.Fatal("resurrected tombstone")
	}
}

// @id TEST-COMPACT-003 @verifies REQ-COMPACT-003
func TestTEST_COMPACT_003(t *testing.T) {
	got := SizeTiered([]Meta{{ID: "a", Size: 100}, {ID: "b", Size: 120}, {ID: "c", Size: 1000}}, 2)
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "b" {
		t.Fatal("tiered group")
	}
}

// @id TEST-COMPACT-004 @verifies REQ-COMPACT-004
func TestTEST_COMPACT_004(t *testing.T) {
	got := Leveled([]Meta{{ID: "a", Level: 0, Min: "b", Max: "e"}, {ID: "b", Level: 1, Min: "a", Max: "c"}, {ID: "c", Level: 1, Min: "e", Max: "z"}, {ID: "d", Level: 1, Min: "f", Max: "z"}}, 0)
	if len(got) != 3 {
		t.Fatalf("overlap selection: %v", got)
	}
}

// @id TEST-COMPACT-005 @verifies REQ-COMPACT-005
func TestTEST_COMPACT_005(t *testing.T) {
	if len(SizeTiered([]Meta{{ID: "a", Size: 100}}, 3)) != 0 {
		t.Fatal("under fan-in scheduled")
	}
}

// @id TEST-COMPACT-006 @verifies REQ-COMPACT-006
func TestTEST_COMPACT_006(t *testing.T) {
	rs := Merge([][]memtable.Record{{r("a", 1, "first", false)}, {r("a", 1, "second", false)}})
	if len(rs) != 1 || string(rs[0].Value) != "first" {
		t.Fatal("duplicate priority")
	}
}

// @id TEST-COMPACT-007 @verifies REQ-COMPACT-007
func TestTEST_COMPACT_007(t *testing.T) {
	d := filepath.Join("../.runtime", t.Name())
	if err := os.MkdirAll(d, 0755); err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(d)
	db, err := store.Open(d)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Put("a", []byte("old")); err != nil {
		t.Fatal(err)
	}
	snap := db.Snapshot()
	if err = db.Flush(); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Delete("a"); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Put("b", []byte("live")); err != nil {
		t.Fatal(err)
	}
	if err = db.Flush(); err != nil {
		t.Fatal(err)
	}
	if err = Run(db); err != nil {
		t.Fatal(err)
	}
	v, ok := db.Get("a", snap)
	if !ok || string(v) != "old" {
		t.Fatal("snapshot lost in compaction")
	}
	if _, ok = db.Get("a", db.Snapshot()); ok {
		t.Fatal("tombstone lost")
	}
	v, ok = db.Get("b", db.Snapshot())
	if !ok || string(v) != "live" {
		t.Fatal("current value lost")
	}
}

// @id TEST-COMPACT-008 @verifies REQ-COMPACT-008
func TestTEST_COMPACT_008(t *testing.T) {
	if len(Merge(nil)) != 0 {
		t.Fatal("nonempty merge")
	}
}
