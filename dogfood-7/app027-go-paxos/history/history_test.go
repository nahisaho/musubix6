package history

import (
	"example.org/paxos/machine"
	"testing"
)

// @id TEST-HISTORY-001 @verifies REQ-HISTORY-001 REQ-HISTORY-002 REQ-HISTORY-003 REQ-HISTORY-004 REQ-HISTORY-005 REQ-HISTORY-006 REQ-HISTORY-007 REQ-HISTORY-008
func TestTEST_HISTORY_001_Search(t *testing.T) {
	put := machine.Command{Kind: "put", Key: "x", Value: "v"}
	get := machine.Command{Kind: "get", Key: "x"}
	h := []Op{{ID: 1, Call: 0, Return: 2, Command: put, Result: machine.Result{Value: "v", OK: true}}, {ID: 2, Call: 3, Return: 4, Command: get, Result: machine.Result{Value: "v", OK: true}}}
	r, e := Check(h, 1000)
	if e != nil || r.Status != Legal || len(r.Witness) != 2 {
		t.Fatal("sequential", r, e)
	}
	h[0].Call = 1
	h[0].Return = 4
	h[1].Call = 0
	h[1].Return = 3
	if r, e = Check(h, 1000); e != nil || r.Status != Legal || r.Witness[0] != 1 {
		t.Fatal("alternate", r, e)
	}
	h[0].Call = 5
	h[0].Return = 6
	if r, e = Check(h, 1000); e != nil || r.Status != Illegal {
		t.Fatal("precedence")
	}
	h[0].Call = 0
	h[0].Return = 1
	h[1].Result.Value = "never"
	if r, e = Check(h, 1000); e != nil || r.Status != Illegal {
		t.Fatal("impossible read")
	}
	h[1].Command = machine.Command{Kind: "cas", Key: "x", Expect: "v", Value: "z"}
	h[1].Result = machine.Result{Value: "z", OK: true}
	if r, e = Check(h, 1000); e != nil || r.Status != Legal {
		t.Fatal("cas")
	}
	h[1].Result.OK = false
	if r, _ = Check(h, 1000); r.Status != Illegal {
		t.Fatal("cas flag")
	}
	h[1].Pending = true
	if r, e = Check(h, 1000); e != nil || r.Status != Legal {
		t.Fatal("pending")
	}
	if r, e = Check(h, 0); e != nil || r.Status != Unknown {
		t.Fatal("budget")
	}
	h[1].ID = 1
	if _, e = Check(h, 1000); e == nil {
		t.Fatal("duplicate ID")
	}
	h[1].ID = 2
	h[1].Pending = false
	h[1].Return = -1
	if _, e = Check(h, 1000); e == nil {
		t.Fatal("invalid interval")
	}
}
