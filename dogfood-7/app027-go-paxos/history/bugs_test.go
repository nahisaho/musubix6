package history

import (
	"example.org/paxos/machine"
	"testing"
)

// @id TEST-HISTORY-002 @verifies REQ-HISTORY-009
func TestTEST_HISTORY_002_TiedIntervals(t *testing.T) {
	h := []Op{
		{ID: 1, Call: 0, Return: 0, Command: machine.Command{Kind: "put", Key: "x", Value: "v"}, Result: machine.Result{Value: "v", OK: true}},
		{ID: 2, Call: 0, Return: 0, Command: machine.Command{Kind: "get", Key: "x"}, Result: machine.Result{Value: "v", OK: true}},
	}
	r, err := Check(h, 100)
	if err != nil || r.Status != Legal {
		t.Fatal("legal tied intervals rejected", r, err)
	}
}
