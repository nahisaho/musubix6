package sstable

import (
	"dogfood/lsm/memtable"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func pathFor(t *testing.T) string {
	t.Helper()
	d := filepath.Join("../.runtime", t.Name())
	if err := os.MkdirAll(d, 0755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(d) })
	return filepath.Join(d, "table.sst")
}
func records() []memtable.Record {
	return []memtable.Record{{Key: "a", Seq: 2, Value: []byte("new")}, {Key: "a", Seq: 1, Value: []byte("old")}, {Key: "b", Seq: 3, Deleted: true}}
}
func table(t *testing.T, rs []memtable.Record) *Table {
	t.Helper()
	p := pathFor(t)
	if err := Write(p, rs); err != nil {
		t.Fatal(err)
	}
	s, err := Open(p)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// @id TEST-SST-001 @verifies REQ-SST-001
func TestTEST_SST_001(t *testing.T) {
	s := table(t, records())
	if len(s.Records()) != 3 {
		t.Fatal("roundtrip versions")
	}
}

// @id TEST-SST-002 @verifies REQ-SST-002
func TestTEST_SST_002(t *testing.T) {
	s := table(t, records())
	for _, k := range []string{"a", "b"} {
		if !s.MayContain(k) {
			t.Fatal("bloom false negative")
		}
	}
}

// @id TEST-SST-003 @verifies REQ-SST-003
func TestTEST_SST_003(t *testing.T) {
	var rs []memtable.Record
	for i := 0; i < 100; i++ {
		rs = append(rs, memtable.Record{Key: fmt.Sprint(i), Seq: 1})
	}
	s := table(t, rs)
	rejected := 0
	for i := 0; i < 1000; i++ {
		if !s.MayContain(fmt.Sprintf("absent-%d", i)) {
			rejected++
		}
	}
	if rejected < 800 {
		t.Fatalf("bloom rejects only %d", rejected)
	}
}

// @id TEST-SST-004 @verifies REQ-SST-004
func TestTEST_SST_004(t *testing.T) {
	p := pathFor(t)
	if err := Write(p, records()); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	b[len(b)/2] ^= 1
	if err = os.WriteFile(p, b, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err = Open(p); err == nil {
		t.Fatal("corruption accepted")
	}
}

// @id TEST-SST-005 @verifies REQ-SST-005
func TestTEST_SST_005(t *testing.T) {
	s := table(t, []memtable.Record{{Key: "z", Seq: 1}, {Key: "a", Seq: 1}, {Key: "a", Seq: 4}})
	rs := s.Records()
	if rs[0].Key != "a" || rs[0].Seq != 4 || rs[1].Seq != 1 || rs[2].Key != "z" {
		t.Fatal("sort order")
	}
}

// @id TEST-SST-006 @verifies REQ-SST-006
func TestTEST_SST_006(t *testing.T) {
	s := table(t, records())
	r, ok := s.Get("b", 9)
	if !ok || !r.Deleted {
		t.Fatal("tombstone lost")
	}
}

// @id TEST-SST-007 @verifies REQ-SST-007
func TestTEST_SST_007(t *testing.T) {
	s := table(t, records())
	r, ok := s.Get("a", 1)
	if !ok || string(r.Value) != "old" {
		t.Fatal("historical version")
	}
}

// @id TEST-SST-008 @verifies REQ-SST-008
func TestTEST_SST_008(t *testing.T) {
	s := table(t, nil)
	if len(s.Records()) != 0 || s.MayContain("x") {
		t.Fatal("empty table")
	}
}
