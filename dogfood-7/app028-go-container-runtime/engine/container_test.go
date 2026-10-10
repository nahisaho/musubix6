package engine

import (
	"example.com/runtime/cgroup"
	"example.com/runtime/internal/oci"
	"example.com/runtime/overlay"
	"testing"
)

// @id TEST-LIFE-001 @verifies REQ-LIFE-001 REQ-LIFE-002 REQ-LIFE-003 REQ-LIFE-004 REQ-LIFE-005 REQ-LIFE-006 REQ-LIFE-007 REQ-LIFE-008
func TestTEST_LIFE_001_Transitions(t *testing.T) {
	spec := oci.Spec{Version: "1.0.2", Root: "/root", Args: []string{"sh"}, Limits: oci.Limits{Memory: 10}}
	c, e := New("c1", spec, overlay.New())
	if e != nil || c.State != Created {
		t.Fatal("create")
	}
	if _, e = New("", spec, overlay.New()); e == nil {
		t.Fatal("empty id")
	}
	if c.Execute(cgroup.Usage{Memory: 1}) == nil {
		t.Fatal("exec before start")
	}
	want := map[State]map[string]State{
		Created: {"start": Running, "delete": Deleted}, Running: {"pause": Paused, "stop": Stopped},
		Paused: {"resume": Running, "stop": Stopped}, Stopped: {"start": Running, "delete": Deleted}, Deleted: {},
	}
	for _, state := range []State{Created, Running, Paused, Stopped, Deleted} {
		for _, action := range []string{"start", "pause", "resume", "stop", "delete", "invalid"} {
			t.Run(string(state)+"/"+action, func(t *testing.T) {
				x, _ := New("x", spec, overlay.New())
				x.State = state
				next, ok := want[state][action]
				e := x.Apply(action)
				if ok {
					if e != nil || x.State != next || len(x.Events) != 1 {
						t.Fatal("legal transition")
					}
				} else if e == nil || x.State != state || len(x.Events) != 0 {
					t.Fatal("illegal transition")
				}
			})
		}
	}
	_ = c.Apply("start")
	if c.Execute(cgroup.Usage{Memory: 10}) != nil {
		t.Fatal("execute")
	}
	if c.Execute(cgroup.Usage{Memory: 1}) == nil {
		t.Fatal("limit")
	}
	_ = c.Apply("stop")
	if c.Group.Snapshot() != (cgroup.Usage{}) {
		t.Fatal("cleanup")
	}
	if len(c.Events) != 2 || c.Events[0] != Running || c.Events[1] != Stopped {
		t.Fatal("events")
	}
	spec.Args[0] = "changed"
	if c.Spec.Args[0] != "sh" {
		t.Fatal("spec alias")
	}
}
