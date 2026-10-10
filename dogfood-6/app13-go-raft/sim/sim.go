// Package sim wires nodes, a fake network and a fake clock into a deterministic cluster.
package sim

import (
	"errors"
	"fmt"
	"hash/fnv"

	"raftsim/clock"
	"raftsim/network"
	"raftsim/node"
	"raftsim/rlog"
)

var ErrNoLeader = errors.New("sim: no leader")

const (
	electionMin = 150
	electionMax = 300
	heartbeat   = 50
	latency     = 5
)

type Cluster struct {
	clk        *clock.Clock
	net        *network.Net
	nodes      []*node.Node
	applied    [][]string
	committed  map[uint64]rlog.Entry
	termLeader map[uint64]int
	checked    map[uint64]bool
	viol       []string
	trace      uint64
}

/** @id CODE-SIM-001 @implements REQ-SIM-001 */
func New(n int, seed uint64) *Cluster {
	c := &Cluster{clk: clock.New(), committed: map[uint64]rlog.Entry{}, termLeader: map[uint64]int{},
		checked: map[uint64]bool{}, applied: make([][]string, n), trace: 14695981039346656037}
	c.net = network.New(c.clk, latency)
	for id := 0; id < n; id++ {
		id := id
		var peers []int
		for p := 0; p < n; p++ {
			if p != id {
				peers = append(peers, p)
			}
		}
		nd := node.New(node.Config{
			ID: id, Peers: peers, Clock: c.clk, Seed: seed,
			ElectionMin: electionMin, ElectionMax: electionMax, Heartbeat: heartbeat,
			Send:  func(to int, m any) { c.net.Send(id, to, m) },
			Apply: func(idx uint64, e rlog.Entry) { c.onApply(id, idx, e) },
		})
		c.nodes = append(c.nodes, nd)
		c.net.Register(id, func(m network.Msg) { nd.Step(m.From, m.Payload) })
	}
	for _, nd := range c.nodes {
		nd.Start()
	}
	return c
}

func (c *Cluster) N() int                    { return len(c.nodes) }
func (c *Cluster) Clock() *clock.Clock       { return c.clk }
func (c *Cluster) Net() *network.Net         { return c.net }
func (c *Cluster) Node(id int) *node.Node    { return c.nodes[id] }
func (c *Cluster) Violations() []string      { return append([]string(nil), c.viol...) }
func (c *Cluster) Applied(id int) []string   { return append([]string(nil), c.applied[id]...) }
func (c *Cluster) Trace() uint64             { return c.trace }
func (c *Cluster) Partition(groups ...[]int) { c.net.Partition(groups...) }
func (c *Cluster) Heal()                     { c.net.Heal() }

func (c *Cluster) fail(tag, format string, args ...any) {
	c.viol = append(c.viol, tag+": "+fmt.Sprintf(format, args...))
}

/** @id CODE-SIM-002 @implements REQ-SIM-002 */
func (c *Cluster) Run(d int64) {
	for i := int64(0); i < d; i++ {
		_ = c.clk.Advance(1)
		c.check()
	}
}

/** @id CODE-SIM-003 @implements REQ-SIM-004 REQ-SIM-005 */
func (c *Cluster) Leader() (int, bool) {
	best, ok := 0, false
	for i, nd := range c.nodes {
		if nd.Role() == node.Leader && (!ok || nd.Term() > c.nodes[best].Term()) {
			best, ok = i, true
		}
	}
	return best, ok
}

func (c *Cluster) Propose(cmd string) (uint64, error) {
	l, ok := c.Leader()
	if !ok {
		return 0, ErrNoLeader
	}
	return c.nodes[l].Propose(cmd)
}

/** @id CODE-SIM-004 @implements REQ-SIM-009 */
func (c *Cluster) onApply(id int, idx uint64, e rlog.Entry) {
	if prev, ok := c.committed[idx]; ok && (prev.Cmd != e.Cmd || prev.Term != e.Term) {
		c.fail("state-machine-safety", "node %d applied %q at index %d, others applied %q", id, e.Cmd, idx, prev.Cmd)
	} else if !ok {
		c.committed[idx] = e
	}
	c.applied[id] = append(c.applied[id], e.Cmd)
}

/** @id CODE-SIM-005 @implements REQ-SIM-011 */
func (c *Cluster) check() {
	h := fnv.New64a()
	fmt.Fprintf(h, "%d|%d|", c.trace, c.clk.Now())
	for id, nd := range c.nodes {
		fmt.Fprintf(h, "%d,%d,%d,%d,%d;", id, nd.Role(), nd.Term(), nd.CommitIndex(), nd.Log().LastIndex())
		if nd.Role() == node.Leader {
			c.checkLeader(id, nd)
		}
	}
	c.trace = h.Sum64()
	c.checkLogMatching()
}
