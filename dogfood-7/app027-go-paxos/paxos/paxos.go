package paxos

import (
	"encoding/json"
	"errors"
	"example.org/paxos/net"
	"example.org/paxos/quorum"
	"fmt"
	"strings"
)

// @id CODE-PAXOS-001 @implements REQ-PAXOS-001 REQ-PAXOS-002 REQ-PAXOS-003 REQ-PAXOS-004 REQ-PAXOS-005 REQ-PAXOS-006 REQ-PAXOS-007 REQ-PAXOS-008
type Accepted struct {
	Ballot int
	Value  string
}
type Node struct {
	ID, Promise int
	Log         map[int]Accepted
	Live        bool
}

func NewNode(id int) *Node { return &Node{ID: id, Log: map[int]Accepted{}, Live: true} }
func (n *Node) Prepare(ballot int) (bool, map[int]Accepted) {
	if !n.Live || ballot < n.Promise {
		return false, nil
	}
	n.Promise = ballot
	log := map[int]Accepted{}
	for s, v := range n.Log {
		log[s] = v
	}
	return true, log
}
func (n *Node) Accept(ballot, slot int, value string) bool {
	if !n.Live || ballot < n.Promise || slot <= 0 {
		return false
	}
	if n.conflicts(ballot, slot, value) {
		return false
	}
	n.Promise = ballot
	n.Log[slot] = Accepted{ballot, value}
	return true
}

// @id CODE-PAXOS-002 @implements REQ-PAXOS-009
func (n *Node) conflicts(ballot, slot int, value string) bool {
	a, ok := n.Log[slot]
	return ok && a.Ballot == ballot && a.Value != value
}
func (n *Node) Restart() { n.Live = true }

type message struct {
	Kind                string
	Round, Ballot, Slot int
	Value               string
	OK                  bool
	Log                 map[int]Accepted
}
type transition struct{ Old, New []int }
type Cluster struct {
	Nodes          map[int]*Node
	Chosen         map[int]string
	Config         quorum.Config
	PhaseOne       int
	Net            *net.Network
	Leader, Ballot int
	round          int
	active         bool
	reply          func(int, message)
}

func NewCluster(voters, all []int) *Cluster {
	cfg, err := quorum.New(voters, nil)
	if err != nil {
		panic(err)
	}
	c := &Cluster{Nodes: map[int]*Node{}, Chosen: map[int]string{}, Config: cfg, Net: net.New()}
	for _, id := range all {
		c.Nodes[id] = NewNode(id)
		c.Net.Handle(id, c.handle)
	}
	for _, id := range voters {
		if c.Nodes[id] == nil {
			panic("missing voter")
		}
	}
	return c
}
func (c *Cluster) handle(e net.Event) {
	var m message
	if json.Unmarshal([]byte(e.Value), &m) != nil {
		return
	}
	if m.Kind == "reply" {
		if m.Round == c.round && c.reply != nil && e.To == c.Leader {
			c.reply(e.From, m)
		}
		return
	}
	n := c.Nodes[e.To]
	response := message{Kind: "reply", Round: m.Round, Ballot: m.Ballot}
	switch m.Kind {
	case "prepare":
		response.OK, response.Log = n.Prepare(m.Ballot)
	case "accept":
		response.OK = n.Accept(m.Ballot, m.Slot, m.Value)
	default:
		return
	}
	b, _ := json.Marshal(response)
	c.Net.Send(e.To, e.From, string(b), 1)
}
func (c *Cluster) exchange(m message, cfg quorum.Config) map[int]message {
	c.round++
	m.Round = c.round
	replies := map[int]message{}
	c.reply = func(id int, r message) {
		if r.Ballot == m.Ballot && r.OK {
			replies[id] = r
		}
	}
	b, _ := json.Marshal(m)
	for _, id := range cfg.Members() {
		c.Net.Send(c.Leader, id, string(b), 1)
	}
	c.Net.Run(100000)
	c.reply = nil
	return replies
}
func votes(replies map[int]message) map[int]bool {
	v := map[int]bool{}
	for id := range replies {
		v[id] = true
	}
	return v
}
func (c *Cluster) Elect(id int) error {
	member := false
	for _, v := range c.Config.Members() {
		if v == id {
			member = true
		}
	}
	if !member {
		return errors.New("leader is not a voter")
	}
	c.active = false
	c.Leader = id
	for _, n := range c.Nodes {
		if n.Promise > c.Ballot {
			c.Ballot = n.Promise
		}
	}
	c.Ballot++
	c.PhaseOne++
	replies := c.exchange(message{Kind: "prepare", Ballot: c.Ballot}, c.Config)
	if !c.Config.Has(votes(replies)) {
		return errors.New("prepare lacks quorum")
	}
	recovered := map[int]Accepted{}
	max := 0
	for _, r := range replies {
		for slot, a := range r.Log {
			if slot > max {
				max = slot
			}
			if prior, ok := recovered[slot]; !ok || a.Ballot > prior.Ballot {
				recovered[slot] = a
			}
		}
	}
	c.active = true
	for slot := 1; slot <= max; slot++ {
		if _, ok := c.Chosen[slot]; ok {
			continue
		}
		value := "@noop"
		if a, ok := recovered[slot]; ok {
			value = a.Value
		}
		if err := c.choose(slot, value); err != nil {
			c.active = false
			return err
		}
	}
	return nil
}
func (c *Cluster) choose(slot int, value string) error {
	cfg := c.Config
	replies := c.exchange(message{Kind: "accept", Ballot: c.Ballot, Slot: slot, Value: value}, cfg)
	if !cfg.Has(votes(replies)) {
		c.active = false
		return errors.New("accept lacks quorum")
	}
	if old, ok := c.Chosen[slot]; ok && old != value {
		return errors.New("chosen conflict")
	}
	c.Chosen[slot] = value
	if strings.HasPrefix(value, "@config:") {
		var tr transition
		if err := json.Unmarshal([]byte(strings.TrimPrefix(value, "@config:")), &tr); err != nil {
			return err
		}
		next, err := quorum.New(tr.Old, tr.New)
		if err != nil {
			return err
		}
		c.Config = next
	}
	return nil
}
func (c *Cluster) propose(value string) (int, error) {
	if !c.active {
		return 0, errors.New("no active leader")
	}
	slot := 1
	for {
		if _, ok := c.Chosen[slot]; !ok {
			break
		}
		slot++
	}
	if err := c.choose(slot, value); err != nil {
		return 0, err
	}
	return slot, nil
}
func (c *Cluster) Propose(value string) (int, error) {
	if strings.HasPrefix(value, "@") {
		return 0, errors.New("reserved value")
	}
	return c.propose(value)
}
func (c *Cluster) Reconfigure(next []int) error {
	if c.Config.Joint() {
		return errors.New("already joint; elect to recover first")
	}
	if _, err := quorum.New(next, nil); err != nil {
		return err
	}
	for _, id := range next {
		if c.Nodes[id] == nil {
			return fmt.Errorf("unprovisioned voter %d", id)
		}
	}
	old := c.Config.Members()
	b, _ := json.Marshal(transition{Old: old, New: next})
	if _, err := c.propose("@config:" + string(b)); err != nil {
		return err
	}
	b, _ = json.Marshal(transition{Old: next})
	if _, err := c.propose("@config:" + string(b)); err != nil {
		return err
	}
	c.Ballot++
	for _, n := range c.Nodes {
		if n.Promise < c.Ballot {
			n.Promise = c.Ballot
		}
	}
	leader := c.Leader
	found := false
	for _, id := range next {
		if id == leader {
			found = true
		}
	}
	if !found {
		leader = next[0]
	}
	return c.Elect(leader)
}
func (c *Cluster) Cut(a, b int, on bool) { c.Net.Partition(a, b, on); c.Net.Partition(b, a, on) }
