package net

import (
	"reflect"
	"testing"
)

// @id TEST-NET-001 @verifies REQ-NET-001 REQ-NET-002 REQ-NET-003 REQ-NET-004 REQ-NET-005 REQ-NET-006 REQ-NET-007 REQ-NET-008
func TestTEST_NET_001_Schedule(t *testing.T) {
	replay := func() []Event {
		n := New()
		var got []Event
		n.Handle(2, func(e Event) { got = append(got, e) })
		if n.Send(1, 2, "late", 5) != nil || n.Send(1, 2, "first", 1) != nil || n.Send(1, 2, "second", 1) != nil {
			t.Fatal("send")
		}
		if n.Run(1) != 1 || len(got) != 1 || got[0].Value != "first" || got[0].At != 1 || n.Pending() != 2 {
			t.Fatal("budget/order", got)
		}
		n.Run(10)
		if len(got) != 3 || got[1].Value != "second" || got[2].At != 5 {
			t.Fatal("deadlines", got)
		}
		n.Partition(1, 2, true)
		n.Send(1, 2, "drop", 0)
		n.Run(1)
		if len(got) != 3 {
			t.Fatal("partition")
		}
		n.Partition(1, 2, false)
		n.Duplicate(1, 2, "twice", 2)
		n.Run(10)
		if len(got) != 5 || got[3].Value != got[4].Value {
			t.Fatal("heal/duplicate")
		}
		before := n.Pending()
		if n.Send(1, 2, "invalid", -1) == nil || before != n.Pending() {
			t.Fatal("negative delay")
		}
		return n.Trace()
	}
	if a, b := replay(), replay(); !reflect.DeepEqual(a, b) {
		t.Fatal("nondeterministic", a, b)
	}
}
