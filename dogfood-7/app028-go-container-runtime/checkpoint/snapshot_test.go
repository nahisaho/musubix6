package checkpoint

import (
	"example.com/runtime/cgroup"
	"example.com/runtime/engine"
	"example.com/runtime/internal/oci"
	"example.com/runtime/overlay"
	"testing"
)

// @id TEST-SNAP-001 @verifies REQ-SNAP-001 REQ-SNAP-002 REQ-SNAP-003 REQ-SNAP-004 REQ-SNAP-005 REQ-SNAP-006 REQ-SNAP-007 REQ-SNAP-008
func TestTEST_SNAP_001_Roundtrip(t *testing.T) {
	c, _ := engine.New("c", oci.Spec{Version: "1.0.2", Root: "/root", Args: []string{"sh"}, Limits: oci.Limits{Memory: 10}}, overlay.New())
	_ = c.FS.Write("/file", []byte("persist"))
	_ = c.Apply("start")
	_ = c.Execute(cgroup.Usage{Memory: 4})
	if _, e := Save(c); e == nil {
		t.Fatal("running checkpoint")
	}
	_ = c.Apply("pause")
	data, e := Save(c)
	if e != nil {
		t.Fatal(e)
	}
	r, e := Restore(data)
	if e != nil || r.State != engine.Paused || r.ID != "c" {
		t.Fatal("roundtrip")
	}
	b, _ := r.FS.Read("/file")
	if string(b) != "persist" || r.Group.Snapshot().Memory != 4 {
		t.Fatal("lost contents")
	}
	_ = r.FS.Write("/file", []byte("new"))
	b, _ = c.FS.Read("/file")
	if string(b) != "persist" {
		t.Fatal("restore alias")
	}
	if r.Apply("resume") != nil {
		t.Fatal("resume")
	}
	for _, bad := range []string{`{}`, `{`, string(data) + `{}`} {
		if _, e = Restore([]byte(bad)); e == nil {
			t.Fatal("bad checkpoint")
		}
	}
	_ = c.Apply("stop")
	_ = c.Apply("delete")
	if _, e = Save(c); e == nil {
		t.Fatal("deleted checkpoint")
	}
}

// @id TEST-SNAP-002 @verifies REQ-SNAP-001
func TestTEST_SNAP_002_InactiveUsage(t *testing.T) {
	c, _ := engine.New("c", oci.Spec{Version: "1.0.2", Root: "/root", Args: []string{"sh"}}, overlay.New())
	_ = c.Group.Reserve(cgroup.Usage{Memory: 1})
	if _, err := Save(c); err == nil {
		t.Fatal("inactive usage checkpoint accepted")
	}
}
