package store

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func directory(t *testing.T) string {
	t.Helper()
	d := filepath.Join("../.runtime", t.Name())
	if err := os.MkdirAll(d, 0755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(d) })
	return d
}
func database(t *testing.T, d string) *DB {
	t.Helper()
	db, err := Open(d)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}
func write(t *testing.T, db *DB, k, v string) {
	t.Helper()
	if _, err := db.Put(k, []byte(v)); err != nil {
		t.Fatal(err)
	}
}

// @id TEST-ENGINE-001 @verifies REQ-ENGINE-001
func TestTEST_ENGINE_001(t *testing.T) {
	db := database(t, directory(t))
	write(t, db, "a", "one")
	v, ok := db.Get("a", db.Snapshot())
	if !ok || string(v) != "one" {
		t.Fatal("get committed")
	}
}

// @id TEST-ENGINE-002 @verifies REQ-ENGINE-002
func TestTEST_ENGINE_002(t *testing.T) {
	db := database(t, directory(t))
	write(t, db, "a", "one")
	if _, err := db.Delete("a"); err != nil {
		t.Fatal(err)
	}
	if _, ok := db.Get("a", db.Snapshot()); ok {
		t.Fatal("deleted key visible")
	}
}

// @id TEST-ENGINE-003 @verifies REQ-ENGINE-003
func TestTEST_ENGINE_003(t *testing.T) {
	db := database(t, directory(t))
	write(t, db, "a", "one")
	s := db.Snapshot()
	write(t, db, "a", "two")
	v, ok := db.Get("a", s)
	if !ok || string(v) != "one" {
		t.Fatal("snapshot changed")
	}
}

// @id TEST-ENGINE-004 @verifies REQ-ENGINE-004
func TestTEST_ENGINE_004(t *testing.T) {
	db := database(t, directory(t))
	write(t, db, "a", "one")
	if err := db.Flush(); err != nil {
		t.Fatal(err)
	}
	v, ok := db.Get("a", db.Snapshot())
	if !ok || string(v) != "one" {
		t.Fatal("flush lost value")
	}
}

// @id TEST-ENGINE-005 @verifies REQ-ENGINE-005
func TestTEST_ENGINE_005(t *testing.T) {
	d := directory(t)
	db := database(t, d)
	write(t, db, "a", "one")
	db.Close()
	db = database(t, d)
	v, ok := db.Get("a", Snapshot{Seq: 100})
	if !ok || string(v) != "one" {
		t.Fatal("WAL not recovered")
	}
}

// @id TEST-ENGINE-006 @verifies REQ-ENGINE-006
func TestTEST_ENGINE_006(t *testing.T) {
	db := database(t, directory(t))
	write(t, db, "z", "old")
	write(t, db, "a", "a")
	if err := db.Flush(); err != nil {
		t.Fatal(err)
	}
	write(t, db, "z", "new")
	write(t, db, "b", "b")
	it := db.Iterate("", "", db.Snapshot())
	var keys, vals []string
	for it.Next() {
		keys = append(keys, it.Record().Key)
		vals = append(vals, string(it.Record().Value))
	}
	if fmt.Sprint(keys) != "[a b z]" || fmt.Sprint(vals) != "[a b new]" {
		t.Fatalf("iterator %v %v", keys, vals)
	}
}

// @id TEST-ENGINE-007 @verifies REQ-ENGINE-007
func TestTEST_ENGINE_007(t *testing.T) {
	db := database(t, directory(t))
	db.Close()
	if _, err := db.Put("a", []byte("one")); err == nil {
		t.Fatal("closed write")
	}
}

// @id TEST-ENGINE-008 @verifies REQ-ENGINE-008
func TestTEST_ENGINE_008(t *testing.T) {
	db := database(t, directory(t))
	var wg sync.WaitGroup
	seqs := make(chan uint64, 32)
	errs := make(chan error, 32)
	for wave := 0; wave < 2; wave++ {
		start := wave * 16
		for i := start; i < start+16; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				s, err := db.Put(fmt.Sprint(i), []byte("v"))
				if err == nil && (s <= uint64(start) || s > uint64(start+16)) {
					err = fmt.Errorf("sequence %d outside wave %d", s, wave)
				}
				seqs <- s
				errs <- err
			}(i)
		}
		wg.Wait()
	}
	close(seqs)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	seen := map[uint64]bool{}
	for s := range seqs {
		if seen[s] || s == 0 || s > 32 {
			t.Fatal("nonunique sequence")
		}
		seen[s] = true
	}
	if db.Snapshot().Seq != 32 {
		t.Fatal("high watermark")
	}
}

// @id TEST-ENGINE-009 @verifies REQ-ENGINE-009
func TestTEST_ENGINE_009(t *testing.T) {
	for _, flushAt := range []int{0, 1, 2} {
		t.Run(fmt.Sprint(flushAt), func(t *testing.T) {
			d := directory(t)
			db := database(t, d)
			write(t, db, "a", "old")
			if flushAt == 1 {
				if err := db.Flush(); err != nil {
					t.Fatal(err)
				}
			}
			write(t, db, "b", "b")
			if flushAt == 2 {
				if err := db.Flush(); err != nil {
					t.Fatal(err)
				}
			}
			db.Close()
			db = database(t, d)
			snap := db.Snapshot()
			next, err := db.Put("a", []byte("new"))
			if err != nil {
				t.Fatal(err)
			}
			v, ok := db.Get("a", snap)
			if snap.Seq != 2 || next != 3 || !ok || string(v) != "old" {
				t.Fatalf("recovered-sequence: snapshot=%d next=%d value=%q present=%v", snap.Seq, next, v, ok)
			}
			if err = db.Compact(); err != nil {
				t.Fatal(err)
			}
			db.Close()
			db = database(t, d)
			v, ok = db.Get("a", db.Snapshot())
			if !ok || string(v) != "new" {
				t.Fatal("new value lost after reopen/compact")
			}
		})
	}
}
