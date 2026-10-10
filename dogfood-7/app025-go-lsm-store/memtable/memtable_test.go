package memtable

import (
	"sync"
	"testing"
)

func put(m *Table, k string, seq uint64, v string, del bool) {
	m.Put(Record{Key: k, Seq: seq, Value: []byte(v), Deleted: del})
}

// @id TEST-MEM-001 @verifies REQ-MEM-001
func TestTEST_MEM_001(t *testing.T) {
	m := New()
	put(m, "a", 1, "one", false)
	r, ok := m.Get("a", 1)
	if !ok || string(r.Value) != "one" {
		t.Fatal("insert/get failed")
	}
}

// @id TEST-MEM-002 @verifies REQ-MEM-002
func TestTEST_MEM_002(t *testing.T) {
	m := New()
	put(m, "a", 1, "one", false)
	put(m, "a", 2, "two", false)
	r, ok := m.Get("a", 1)
	if !ok || string(r.Value) != "one" {
		t.Fatal("snapshot lost")
	}
}

// @id TEST-MEM-003 @verifies REQ-MEM-003
func TestTEST_MEM_003(t *testing.T) {
	m := New()
	put(m, "a", 1, "one", false)
	put(m, "a", 2, "", true)
	if _, ok := m.Get("a", 2); ok {
		t.Fatal("deleted value visible")
	}
}

// @id TEST-MEM-004 @verifies REQ-MEM-004
func TestTEST_MEM_004(t *testing.T) {
	m := New()
	for _, k := range []string{"d", "c", "b", "a"} {
		put(m, k, 1, k, false)
	}
	got := m.Scan("b", "d", 1)
	if len(got) != 2 || got[0].Key != "b" || got[1].Key != "c" {
		t.Fatalf("range: %v", got)
	}
}

// @id TEST-MEM-005 @verifies REQ-MEM-005
func TestTEST_MEM_005(t *testing.T) {
	m := New()
	put(m, "a", 3, "three", false)
	if _, ok := m.Get("a", 2); ok {
		t.Fatal("future value visible")
	}
}

// @id TEST-MEM-006 @verifies REQ-MEM-006
func TestTEST_MEM_006(t *testing.T) {
	m := New()
	b := []byte("one")
	m.Put(Record{Key: "a", Seq: 1, Value: b})
	b[0] = 'x'
	r, ok := m.Get("a", 1)
	if !ok || string(r.Value) != "one" {
		t.Fatal("input alias")
	}
	r.Value[0] = 'y'
	r, _ = m.Get("a", 1)
	if string(r.Value) != "one" {
		t.Fatal("output alias")
	}
}

// @id TEST-MEM-007 @verifies REQ-MEM-007
func TestTEST_MEM_007(t *testing.T) {
	m := New()
	put(m, "a", 9, "nine", false)
	put(m, "a", 2, "two", false)
	put(m, "a", 5, "five", false)
	r, _ := m.Get("a", 8)
	if string(r.Value) != "five" {
		t.Fatal("out-of-order versions")
	}
}

// @id TEST-MEM-008 @verifies REQ-MEM-008
func TestTEST_MEM_008(t *testing.T) {
	m := New()
	var wg sync.WaitGroup
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); put(m, string(rune(i+64)), uint64(i+1), "v", false) }(i)
	}
	wg.Wait()
	if len(m.Scan("", "", 100)) != 64 {
		t.Fatal("concurrent insert lost")
	}
}

// @id TEST-MEM-009 @verifies REQ-MEM-008
func TestTEST_MEM_009(t *testing.T) {
	m := New()
	for i := 0; i < 64; i++ {
		put(m, string(rune(i+64)), uint64(i+1), "v", false)
	}
	if Count(m) != 64 {
		t.Fatal("live key count incorrect")
	}
}
