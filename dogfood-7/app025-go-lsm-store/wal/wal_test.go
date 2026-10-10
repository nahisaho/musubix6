package wal

import (
	"dogfood/lsm/memtable"
	"os"
	"path/filepath"
	"testing"
)

func logPath(t *testing.T) string {
	t.Helper()
	d := filepath.Join("../.runtime", t.Name())
	if err := os.MkdirAll(d, 0755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(d) })
	return filepath.Join(d, "wal.log")
}
func openLog(t *testing.T, p string) *Log {
	t.Helper()
	l, err := Open(p)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close() })
	return l
}
func appendRecord(t *testing.T, l *Log, r memtable.Record) {
	t.Helper()
	if err := l.Append(r); err != nil {
		t.Fatal(err)
	}
}
func row(k string, s uint64) memtable.Record {
	return memtable.Record{Key: k, Seq: s, Value: []byte(k)}
}

// @id TEST-WAL-001 @verifies REQ-WAL-001
func TestTEST_WAL_001(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	appendRecord(t, l, row("a", 1))
	l.Close()
	rs, err := Recover(p)
	if err != nil || len(rs) != 1 || rs[0].Key != "a" {
		t.Fatalf("recover: %v %v", rs, err)
	}
}

// @id TEST-WAL-002 @verifies REQ-WAL-002
func TestTEST_WAL_002(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	for i, k := range []string{"z", "a", "m"} {
		appendRecord(t, l, row(k, uint64(i+1)))
	}
	rs, err := Recover(p)
	if err != nil || len(rs) != 3 || rs[0].Key != "z" || rs[2].Key != "m" {
		t.Fatal("append order")
	}
}

// @id TEST-WAL-003 @verifies REQ-WAL-003
func TestTEST_WAL_003(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	appendRecord(t, l, row("a", 1))
	appendRecord(t, l, row("b", 2))
	l.Close()
	st, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Truncate(p, st.Size()-5); err != nil {
		t.Fatal(err)
	}
	rs, err := Recover(p)
	if err != nil || len(rs) != 1 || rs[0].Key != "a" {
		t.Fatalf("torn tail: %v %v", rs, err)
	}
}

// @id TEST-WAL-004 @verifies REQ-WAL-004
func TestTEST_WAL_004(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	appendRecord(t, l, row("a", 1))
	l.Close()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	b[len(b)-1] ^= 1
	if err = os.WriteFile(p, b, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err = Recover(p); err == nil {
		t.Fatal("corrupt CRC accepted")
	}
}

// @id TEST-WAL-005 @verifies REQ-WAL-005
func TestTEST_WAL_005(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	appendRecord(t, l, memtable.Record{Key: "a", Seq: 2, Deleted: true})
	rs, err := Recover(p)
	if err != nil || len(rs) != 1 || !rs[0].Deleted {
		t.Fatal("tombstone replay")
	}
}

// @id TEST-WAL-006 @verifies REQ-WAL-006
func TestTEST_WAL_006(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	appendRecord(t, l, row("a", 1))
	if l.Syncs() != 1 {
		t.Fatal("append not synced")
	}
	rs, err := Recover(p)
	if err != nil || len(rs) != 1 {
		t.Fatal("live durable frame missing")
	}
}

// @id TEST-WAL-007 @verifies REQ-WAL-007
func TestTEST_WAL_007(t *testing.T) {
	p := logPath(t)
	openLog(t, p)
	rs, err := Recover(p)
	if err != nil || len(rs) != 0 {
		t.Fatal("empty recovery")
	}
}

// @id TEST-WAL-008 @verifies REQ-WAL-008
func TestTEST_WAL_008(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	l.Close()
	if err := l.Append(row("a", 1)); err == nil {
		t.Fatal("closed append")
	}
}

// @id TEST-WAL-010 @verifies REQ-WAL-010
func TestTEST_WAL_010(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	appendRecord(t, l, row("a", 1))
	appendRecord(t, l, row("discard", 2))
	l.Close()
	st, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Truncate(p, st.Size()-5); err != nil {
		t.Fatal(err)
	}
	l = openLog(t, p)
	appendRecord(t, l, row("new", 3))
	l.Close()
	rs, err := Recover(p)
	if err != nil || len(rs) != 2 || rs[0].Key != "a" || rs[1].Key != "new" {
		t.Fatalf("append-after-tail: %v %v", rs, err)
	}
}
