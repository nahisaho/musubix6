package overlay

import (
	"reflect"
	"testing"
)

// @id TEST-FS-001 @verifies REQ-FS-001 REQ-FS-002 REQ-FS-003 REQ-FS-004 REQ-FS-005 REQ-FS-006 REQ-FS-007 REQ-FS-008
func TestTEST_FS_001_Layers(t *testing.T) {
	low := map[string]Entry{"/a": {Data: []byte("old")}, "/b": {Data: []byte("b")}}
	f := New(low, map[string]Entry{"/a": {Data: []byte("new")}})
	b, e := f.Read("/a")
	if e != nil || string(b) != "new" {
		t.Fatal("precedence")
	}
	b[0] = 'X'
	b, _ = f.Read("/a")
	if string(b) != "new" {
		t.Fatal("read aliases")
	}
	data := []byte("copy")
	if e = f.Write("/c", data); e != nil {
		t.Fatal(e)
	}
	data[0] = 'X'
	b, _ = f.Read("/c")
	if string(b) != "copy" {
		t.Fatal("write aliases")
	}
	if e = f.Remove("/b"); e != nil {
		t.Fatal(e)
	}
	if _, e = f.Read("/b"); e == nil {
		t.Fatal("whiteout")
	}
	if string(low["/a"].Data) != "old" || low["/b"].Deleted {
		t.Fatal("lower mutated")
	}
	if !reflect.DeepEqual(f.List(), []string{"/a", "/c"}) {
		t.Fatal("listing")
	}
	for _, name := range []string{"relative", "/../escape", "/a/../../escape", "/a\x00"} {
		if f.Write(name, []byte("x")) == nil {
			t.Fatalf("unsafe path %q", name)
		}
	}
	empty := New()
	if e = empty.Write("/x", []byte("x")); e != nil {
		t.Fatal(e)
	}
	if _, e = empty.Read("/absent"); e == nil {
		t.Fatal("missing")
	}
}
