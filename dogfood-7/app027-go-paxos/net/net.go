package net

import (
	"container/heap"
	"errors"
)

// @id CODE-NET-001 @implements REQ-NET-001 REQ-NET-002 REQ-NET-003 REQ-NET-004 REQ-NET-005 REQ-NET-006 REQ-NET-007 REQ-NET-008
type Event struct {
	From, To int
	Value    string
	At, Seq  int
	Dropped  bool
}
type events []Event

func (q events) Len() int { return len(q) }
func (q events) Less(i, j int) bool {
	return q[i].At < q[j].At || q[i].At == q[j].At && q[i].Seq < q[j].Seq
}
func (q events) Swap(i, j int) { q[i], q[j] = q[j], q[i] }
func (q *events) Push(v any)   { *q = append(*q, v.(Event)) }
func (q *events) Pop() any     { old := *q; v := old[len(old)-1]; *q = old[:len(old)-1]; return v }

type Network struct {
	now, seq int
	queue    events
	handlers map[int]func(Event)
	blocked  map[[2]int]bool
	trace    []Event
}

func New() *Network {
	return &Network{handlers: make(map[int]func(Event)), blocked: make(map[[2]int]bool)}
}
func (n *Network) Handle(id int, f func(Event)) { n.handlers[id] = f }
func (n *Network) Send(from, to int, value string, delay int) error {
	if delay < 0 || delay > int(^uint(0)>>1)-n.now {
		return errors.New("invalid delay")
	}
	n.seq++
	heap.Push(&n.queue, Event{From: from, To: to, Value: value, At: n.now + delay, Seq: n.seq})
	return nil
}
func (n *Network) Duplicate(from, to int, value string, delay int) {
	n.Send(from, to, value, delay)
	n.Send(from, to, value, delay)
}
func (n *Network) Partition(from, to int, on bool) { n.blocked[[2]int{from, to}] = on }
func (n *Network) Run(budget int) int {
	used := 0
	for used < budget && len(n.queue) > 0 {
		e := heap.Pop(&n.queue).(Event)
		n.now = e.At
		used++
		e.Dropped = n.blocked[[2]int{e.From, e.To}]
		n.trace = append(n.trace, e)
		if !e.Dropped {
			if f := n.handlers[e.To]; f != nil {
				f(e)
			}
		}
	}
	return used
}
func (n *Network) Pending() int   { return len(n.queue) }
func (n *Network) Trace() []Event { return append([]Event(nil), n.trace...) }
