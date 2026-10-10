package paxos

import "testing"

// @id TEST-PAXOS-001 @verifies REQ-PAXOS-001 REQ-PAXOS-002 REQ-PAXOS-003 REQ-PAXOS-004 REQ-PAXOS-005 REQ-PAXOS-006 REQ-PAXOS-007 REQ-PAXOS-008
func TestTEST_PAXOS_001_Protocol(t *testing.T) {
	n := NewNode(1)
	if ok, _ := n.Prepare(5); !ok {
		t.Fatal("prepare")
	}
	if n.Accept(4, 1, "bad") {
		t.Fatal("lower accept")
	}
	if ok, _ := n.Prepare(4); ok {
		t.Fatal("lower prepare")
	}
	if !n.Accept(5, 1, "kept") {
		t.Fatal("accept")
	}
	n.Restart()
	if ok, log := n.Prepare(6); !ok || log[1].Value != "kept" {
		t.Fatal("durable")
	}
	c := NewCluster([]int{1, 2, 3}, []int{1, 2, 3, 4, 5})
	c.Nodes[1].Accept(1, 1, "recover")
	c.Nodes[2].Accept(1, 1, "recover")
	if err := c.Elect(3); err != nil || c.Chosen[1] != "recover" {
		t.Fatal("recovery", err, c.Chosen)
	}
	before := c.PhaseOne
	if slot, err := c.Propose("a"); err != nil || slot != 2 {
		t.Fatal("propose", slot, err)
	}
	if slot, err := c.Propose("b"); err != nil || slot != 3 || c.PhaseOne != before {
		t.Fatal("multi", slot, err)
	}
	if err := c.Reconfigure([]int{3, 4, 5}); err != nil {
		t.Fatal("joint change", err)
	}
	if _, err := c.Propose("new"); err != nil {
		t.Fatal("new config", err)
	}
	if c.Config.Joint() || len(c.Config.Members()) != 3 || c.Config.Members()[0] != 3 {
		t.Fatal("final config")
	}
	c.Cut(3, 4, true)
	c.Cut(3, 5, true)
	last := len(c.Chosen)
	if _, err := c.Propose("unreachable"); err == nil || len(c.Chosen) != last {
		t.Fatal("minority chosen")
	}
	c.Cut(3, 4, false)
	c.Cut(3, 5, false)
	if err := c.Elect(4); err != nil {
		t.Fatal("new leader", err)
	}
	if c.Chosen[1] != "recover" || c.Chosen[2] != "a" {
		t.Fatal("safety")
	}
}
