package machine

import (
	"example.org/paxos/paxos"
	"testing"
)

// @id TEST-MACHINE-001 @verifies REQ-MACHINE-001 REQ-MACHINE-002 REQ-MACHINE-003 REQ-MACHINE-004 REQ-MACHINE-005 REQ-MACHINE-006 REQ-MACHINE-007 REQ-MACHINE-008
func TestTEST_MACHINE_001_Register(t *testing.T) {
	m := New()
	r, e := m.Apply(Command{Client: "a", Seq: 1, Kind: "get", Key: "x"})
	if e != nil || r.Value != "" {
		t.Fatal("absent")
	}
	r, e = m.Apply(Command{Client: "a", Seq: 2, Kind: "put", Key: "x", Value: "one"})
	if e != nil || r.Value != "one" || !r.OK {
		t.Fatal("put")
	}
	r, e = m.Apply(Command{Client: "a", Seq: 3, Kind: "cas", Key: "x", Expect: "one", Value: "two"})
	if e != nil || !r.OK || r.Value != "two" {
		t.Fatal("cas")
	}
	r, e = m.Apply(Command{Client: "b", Seq: 1, Kind: "cas", Key: "x", Expect: "one", Value: "bad"})
	if e != nil || r.OK || r.Value != "two" {
		t.Fatal("failed cas")
	}
	r, e = m.Apply(Command{Client: "a", Seq: 3, Kind: "cas", Key: "x", Expect: "one", Value: "two"})
	if e != nil || !r.OK || r.Value != "two" {
		t.Fatal("retry")
	}
	if _, e = m.Apply(Command{Client: "a", Seq: 1, Kind: "get", Key: "x"}); e == nil {
		t.Fatal("stale")
	}
	c := paxos.NewCluster([]int{1, 2, 3}, []int{1, 2, 3})
	if e = c.Elect(1); e != nil {
		t.Fatal(e)
	}
	s := NewService(c)
	if r, e = s.Submit(Command{Client: "s", Seq: 1, Kind: "put", Key: "q", Value: "quoted \"日本\""}); e != nil || r.Value != "quoted \"日本\"" {
		t.Fatal("encoding", e)
	}
	c.Cut(1, 2, true)
	c.Cut(1, 3, true)
	if _, e = s.Submit(Command{Client: "s", Seq: 2, Kind: "put", Key: "q", Value: "bad"}); e == nil {
		t.Fatal("minority")
	}
	if s.State.Value("q") != "quoted \"日本\"" {
		t.Fatal("uncommitted state")
	}
}
