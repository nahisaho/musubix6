// Package network is a deterministic fake network driven by the fake clock.
package network

import "raftsim/clock"

type Msg struct {
	From, To int
	Payload  any
}

type Stats struct{ Sent, Delivered, Dropped, InFlight int }

type link struct{ from, to int }

type linkState struct {
	latency     int64
	hasLatency  bool
	lastDeliver int64
}

type Net struct {
	c        *clock.Clock
	latency  int64
	handlers map[int]func(Msg)
	links    map[link]*linkState
	cuts     map[link]bool
	down     map[int]bool
	group    map[int]int // node -> group id; nil when no partition
	stats    Stats
}

func New(c *clock.Clock, latency int64) *Net {
	return &Net{c: c, latency: latency, handlers: map[int]func(Msg){}, links: map[link]*linkState{},
		cuts: map[link]bool{}, down: map[int]bool{}}
}

func (n *Net) Register(id int, h func(Msg)) { n.handlers[id] = h }

func (n *Net) state(l link) *linkState {
	s := n.links[l]
	if s == nil {
		s = &linkState{}
		n.links[l] = s
	}
	return s
}

// reachable implements the Design decision table (rows 1-5).
func (n *Net) reachable(from, to int) bool {
	if _, ok := n.handlers[to]; !ok {
		return false
	}
	if from == to {
		return true
	}
	if n.down[from] || n.down[to] || n.cuts[link{from, to}] {
		return false
	}
	if n.group != nil {
		gf, okf := n.group[from]
		gt, okt := n.group[to]
		if !okf || !okt || gf != gt {
			return false
		}
	}
	return true
}

/** @id CODE-NET-001 @implements REQ-NET-001 REQ-NET-002 REQ-NET-010 REQ-NET-003 REQ-NET-004 REQ-NET-008 REQ-NET-009 */
func (n *Net) Send(from, to int, p any) bool {
	n.stats.Sent++
	if !n.reachable(from, to) {
		n.stats.Dropped++
		return false
	}
	l := link{from, to}
	s := n.state(l)
	lat := n.latency
	if s.hasLatency {
		lat = s.latency
	}
	at := n.c.Now() + lat
	if at < s.lastDeliver {
		at = s.lastDeliver
	}
	s.lastDeliver = at
	n.stats.InFlight++
	m := Msg{From: from, To: to, Payload: p}
	n.c.AfterFunc(at-n.c.Now(), func() {
		n.stats.InFlight--
		if !n.reachable(from, to) {
			n.stats.Dropped++
			return
		}
		n.stats.Delivered++
		n.handlers[to](m)
	})
	return true
}

/** @id CODE-NET-002 @implements REQ-NET-004 REQ-NET-005 */
func (n *Net) Partition(groups ...[]int) {
	n.group = map[int]int{}
	for gi, g := range groups {
		for _, id := range g {
			n.group[id] = gi
		}
	}
}

func (n *Net) Heal() {
	n.group = nil
	n.cuts = map[link]bool{}
}

/** @id CODE-NET-003 @implements REQ-NET-006 */
func (n *Net) Cut(from, to int)     { n.cuts[link{from, to}] = true }
func (n *Net) Restore(from, to int) { delete(n.cuts, link{from, to}) }

/** @id CODE-NET-004 @implements REQ-NET-007 */
func (n *Net) SetLatency(from, to int, d int64) {
	if d < 0 {
		d = 0
	}
	s := n.state(link{from, to})
	s.latency, s.hasLatency = d, true
}

func (n *Net) SetDown(id int, down bool) {
	if down {
		n.down[id] = true
	} else {
		delete(n.down, id)
	}
}

func (n *Net) Stats() Stats { return n.stats }
