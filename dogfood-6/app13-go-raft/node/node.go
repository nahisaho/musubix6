package node

import (
	"raftsim/clock"
	"raftsim/rlog"
)

type Node struct {
	cfg       Config
	role      Role
	term      uint64
	votedFor  int
	hasVote   bool
	leader    int
	hasLeader bool
	votes     map[int]bool
	k         int
	timer     *clock.Timer
	log       *rlog.Log

	hb      *clock.Timer
	next    map[int]uint64
	match   map[int]uint64
	commit  uint64
	applied uint64
}

func New(cfg Config) *Node {
	return &Node{cfg: cfg, log: rlog.New()}
}

/** @id CODE-ELECT-001 @implements REQ-ELECT-002 */
func Timeout(seed uint64, id, k int, min, max int64) int64 {
	if max <= min {
		return min
	}
	z := seed + uint64(id+1)*0x9e3779b97f4a7c15 + uint64(k+1)*0xbf58476d1ce4e5b9
	z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9
	z = (z ^ (z >> 27)) * 0x94d049bb133111eb
	z ^= z >> 31
	return min + int64(z%uint64(max-min+1))
}

/** @id CODE-ELECT-002 @implements REQ-ELECT-001 */
func (n *Node) Role() Role            { return n.role }
func (n *Node) Term() uint64          { return n.term }
func (n *Node) Log() *rlog.Log        { return n.log }
func (n *Node) VotedFor() (int, bool) { return n.votedFor, n.hasVote }
func (n *Node) Leader() (int, bool)   { return n.leader, n.hasLeader }

func (n *Node) Start() { n.resetTimer() }

/** @id CODE-ELECT-003 @implements REQ-ELECT-008 REQ-ELECT-009 */
func (n *Node) resetTimer() {
	if n.timer != nil {
		n.timer.Stop()
	}
	d := Timeout(n.cfg.Seed, n.cfg.ID, n.k, n.cfg.ElectionMin, n.cfg.ElectionMax)
	n.k++
	n.timer = n.cfg.Clock.AfterFunc(d, n.onElectionTimeout)
}

func (n *Node) majority() int { return (len(n.cfg.Peers)+1)/2 + 1 }

/** @id CODE-ELECT-004 @implements REQ-ELECT-003 REQ-ELECT-009 REQ-ELECT-012 */
func (n *Node) onElectionTimeout() {
	n.role = Candidate
	n.term++
	n.votedFor, n.hasVote = n.cfg.ID, true
	n.hasLeader = false
	n.votes = map[int]bool{n.cfg.ID: true}
	n.resetTimer()
	for _, p := range n.cfg.Peers {
		n.cfg.Send(p, RequestVote{Term: n.term, Candidate: n.cfg.ID, LastIdx: n.log.LastIndex(), LastTerm: n.log.LastTerm()})
	}
	n.maybeWin()
}

/** @id CODE-ELECT-005 @implements REQ-ELECT-007 */
func (n *Node) maybeWin() {
	if n.role == Candidate && len(n.votes) >= n.majority() {
		n.role = Leader
		n.leader, n.hasLeader = n.cfg.ID, true
		if n.timer != nil {
			n.timer.Stop()
		}
		n.onBecomeLeader()
	}
}

/** @id CODE-ELECT-006 @implements REQ-ELECT-005 */
func (n *Node) becomeFollower(term uint64) {
	n.term = term
	n.role = Follower
	n.hasVote = false
	n.hasLeader = false
	if n.hb != nil {
		n.hb.Stop()
	}
}

func msgTerm(m any) uint64 {
	switch v := m.(type) {
	case RequestVote:
		return v.Term
	case VoteResp:
		return v.Term
	case AppendEntries:
		return v.Term
	case AppendResp:
		return v.Term
	}
	return 0
}

/** @id CODE-ELECT-007 @implements REQ-ELECT-004 REQ-ELECT-005 REQ-ELECT-006 REQ-ELECT-010 REQ-ELECT-011 */
func (n *Node) Step(from int, m any) {
	if mt := msgTerm(m); mt > n.term {
		wasLeader := n.role == Leader
		n.becomeFollower(mt)
		if wasLeader {
			n.resetTimer()
		}
	}
	switch v := m.(type) {
	case RequestVote:
		n.handleRequestVote(from, v)
	case VoteResp:
		n.handleVoteResp(from, v)
	case AppendEntries:
		n.handleAppend(from, v)
	case AppendResp:
		n.handleAppendResp(from, v)
	}
}

func (n *Node) handleVoteResp(from int, v VoteResp) {
	if n.role != Candidate || v.Term != n.term || !n.isPeer(from) || !v.Granted {
		return
	}
	n.votes[from] = true
	n.maybeWin()
}

func (n *Node) isPeer(id int) bool {
	for _, p := range n.cfg.Peers {
		if p == id {
			return true
		}
	}
	return false
}

func (n *Node) handleRequestVote(from int, v RequestVote) {
	grant := v.Term >= n.term &&
		(!n.hasVote || n.votedFor == v.Candidate) &&
		n.log.UpToDate(v.LastTerm, v.LastIdx)
	if grant {
		n.votedFor, n.hasVote = v.Candidate, true
		n.resetTimer()
	}
	n.cfg.Send(from, VoteResp{Term: n.term, Granted: grant})
}
