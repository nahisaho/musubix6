package paxos

import "testing"

// @id TEST-PAXOS-002 @verifies REQ-PAXOS-009
func TestTEST_PAXOS_002_ConflictingRetransmit(t *testing.T) {
	n := NewNode(1)
	if !n.Accept(5, 1, "a") || !n.Accept(5, 1, "a") {
		t.Fatal("identical retry must succeed")
	}
	if n.Accept(5, 1, "b") || n.Log[1].Value != "a" {
		t.Fatal("conflicting same-ballot retry accepted")
	}
	if !n.Accept(6, 1, "b") {
		t.Fatal("higher ballot may supersede unchosen value")
	}
}
