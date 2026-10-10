package node

const maxBatch = 64

/** @id CODE-REPL-001 @implements REQ-REPL-001 */
func (n *Node) onBecomeLeader() {
	n.next = map[int]uint64{}
	n.match = map[int]uint64{}
	for _, p := range n.cfg.Peers {
		n.next[p] = n.log.LastIndex() + 1
		n.match[p] = 0
	}
	n.broadcast()
	n.armHeartbeat()
}

func (n *Node) armHeartbeat() {
	n.hb = n.cfg.Clock.AfterFunc(n.cfg.Heartbeat, func() {
		if n.role != Leader {
			return
		}
		n.broadcast()
		n.armHeartbeat()
	})
}

func (n *Node) broadcast() {
	for _, p := range n.cfg.Peers {
		n.sendAppend(p)
	}
}

func (n *Node) sendAppend(p int) {
	prev := n.next[p] - 1
	pt, _ := n.log.Term(prev)
	n.cfg.Send(p, AppendEntries{
		Term: n.term, Leader: n.cfg.ID, PrevIdx: prev, PrevTerm: pt,
		Entries: n.log.Slice(n.next[p], maxBatch), Commit: n.commit,
	})
}

/** @id CODE-REPL-002 @implements REQ-REPL-002 REQ-REPL-011 */
func (n *Node) Propose(cmd string) (uint64, error) {
	if n.role != Leader {
		return 0, ErrNotLeader
	}
	idx := n.log.Append(n.term, cmd)
	n.broadcast()
	n.advanceCommit()
	return idx, nil
}

func (n *Node) CommitIndex() uint64 { return n.commit }

/** @id CODE-REPL-003 @implements REQ-REPL-003 REQ-REPL-005 REQ-REPL-008 REQ-REPL-010 */
func (n *Node) handleAppend(from int, v AppendEntries) {
	if v.Term < n.term {
		n.cfg.Send(from, AppendResp{Term: n.term, Success: false})
		return
	}
	n.role = Follower
	n.leader, n.hasLeader = from, true
	n.resetTimer()
	last, ok := n.log.Merge(v.PrevIdx, v.PrevTerm, v.Entries)
	if !ok {
		n.cfg.Send(from, AppendResp{Term: n.term, Success: false})
		return
	}
	if v.Commit > n.commit {
		c := v.Commit
		if last < c {
			c = last
		}
		n.setCommit(c)
	}
	n.cfg.Send(from, AppendResp{Term: n.term, Success: true, Match: last})
}

/** @id CODE-REPL-004 @implements REQ-REPL-004 REQ-REPL-006 REQ-REPL-013 */
func (n *Node) handleAppendResp(from int, v AppendResp) {
	if n.role != Leader || v.Term != n.term || !n.isPeer(from) {
		return
	}
	if !v.Success {
		if n.next[from] > 1 {
			n.next[from]--
		}
		n.sendAppend(from)
		return
	}
	if v.Match < n.match[from] {
		return
	}
	n.match[from] = v.Match
	n.next[from] = v.Match + 1
	n.advanceCommit()
}

/** @id CODE-REPL-005 @implements REQ-REPL-007 REQ-REPL-012 */
func (n *Node) advanceCommit() {
	for idx := n.log.LastIndex(); idx > n.commit; idx-- {
		if t, _ := n.log.Term(idx); t != n.term {
			continue
		}
		count := 1
		for _, p := range n.cfg.Peers {
			if n.match[p] >= idx {
				count++
			}
		}
		if count >= n.majority() {
			n.setCommit(idx)
			return
		}
	}
}

/** @id CODE-REPL-006 @implements REQ-REPL-009 */
func (n *Node) setCommit(c uint64) {
	if c <= n.commit {
		return
	}
	n.commit = c
	for n.applied < n.commit {
		n.applied++
		if n.cfg.Apply != nil {
			e, _ := n.log.Get(n.applied)
			n.cfg.Apply(n.applied, e)
		}
	}
}
