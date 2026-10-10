package node_test

import (
	"reflect"
	"testing"

	"raftsim/clock"
	"raftsim/node"
)

type out struct {
	to int
	m  any
}

type h struct {
	c   *clock.Clock
	n   *node.Node
	out []out
}

// newH builds node id with the given peers and a fixed 100-tick election timeout.
func newH(id int, peers ...int) *h {
	x := &h{c: clock.New()}
	x.n = node.New(node.Config{
		ID: id, Peers: peers, Clock: x.c, Seed: 7,
		ElectionMin: 100, ElectionMax: 100, Heartbeat: 20,
		Send: func(to int, m any) { x.out = append(x.out, out{to, m}) },
	})
	x.n.Start()
	return x
}

func (x *h) take() []out { o := x.out; x.out = nil; return o }

func (x *h) tick(d int64) { _ = x.c.Advance(d) }

/** @id TEST-ELECT-001 @verifies REQ-ELECT-001 */
func TestTEST_ELECT_001_initial(t *testing.T) {
	x := newH(1, 2, 3)
	if x.n.Role() != node.Follower || x.n.Term() != 0 {
		t.Fatalf("role=%v term=%d", x.n.Role(), x.n.Term())
	}
	if _, ok := x.n.VotedFor(); ok {
		t.Fatal("must have no vote")
	}
	if _, ok := x.n.Leader(); ok {
		t.Fatal("must have no leader")
	}
}

/** @id TEST-ELECT-002 @verifies REQ-ELECT-002 */
func TestTEST_ELECT_002_timeoutPure(t *testing.T) {
	seen := map[int64]bool{}
	for id := 0; id < 5; id++ {
		for k := 0; k < 20; k++ {
			v := node.Timeout(42, id, k, 150, 300)
			if v < 150 || v > 300 {
				t.Fatalf("out of range %d", v)
			}
			if v != node.Timeout(42, id, k, 150, 300) {
				t.Fatal("not deterministic")
			}
			seen[v] = true
		}
	}
	if len(seen) < 20 {
		t.Fatalf("too little variation: %d distinct", len(seen))
	}
	if node.Timeout(1, 1, 1, 50, 50) != 50 || node.Timeout(1, 1, 1, 80, 60) != 80 {
		t.Fatal("min>=max must return min")
	}
	if node.Timeout(1, 1, 1, 0, 1000) == node.Timeout(2, 1, 1, 0, 1000) && node.Timeout(1, 1, 2, 0, 1000) == node.Timeout(2, 1, 2, 0, 1000) {
		t.Fatal("seed must matter")
	}
}

/** @id TEST-ELECT-003 @verifies REQ-ELECT-003 */
func TestTEST_ELECT_003_startElection(t *testing.T) {
	x := newH(1, 2, 3)
	x.tick(99)
	if x.n.Role() != node.Follower {
		t.Fatal("fired early")
	}
	x.tick(1)
	if x.n.Role() != node.Candidate || x.n.Term() != 1 {
		t.Fatalf("role=%v term=%d", x.n.Role(), x.n.Term())
	}
	if v, ok := x.n.VotedFor(); !ok || v != 1 {
		t.Fatalf("vote=%d,%v", v, ok)
	}
	want := []out{
		{2, node.RequestVote{Term: 1, Candidate: 1}},
		{3, node.RequestVote{Term: 1, Candidate: 1}},
	}
	if got := x.take(); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v", got)
	}
}

/** @id TEST-ELECT-004 @verifies REQ-ELECT-004 */
func TestTEST_ELECT_004_grantRules(t *testing.T) {
	x := newH(1, 2, 3)
	x.n.Log().Append(1, "a")
	x.n.Log().Append(2, "b") // lastTerm=2 lastIdx=2
	x.n.Step(2, node.RequestVote{Term: 3, Candidate: 2, LastIdx: 1, LastTerm: 2})
	r := x.take()[0].m.(node.VoteResp)
	if r.Granted || r.Term != 3 {
		t.Fatalf("log behind must be refused: %+v", r)
	}
	x.n.Step(2, node.RequestVote{Term: 3, Candidate: 2, LastIdx: 2, LastTerm: 2})
	if r := x.take()[0].m.(node.VoteResp); !r.Granted {
		t.Fatal("up-to-date log must be granted")
	}
	x.n.Step(2, node.RequestVote{Term: 3, Candidate: 2, LastIdx: 2, LastTerm: 2})
	if r := x.take()[0].m.(node.VoteResp); !r.Granted {
		t.Fatal("repeat from same candidate must be granted")
	}
	x.n.Step(3, node.RequestVote{Term: 3, Candidate: 3, LastIdx: 9, LastTerm: 9})
	if r := x.take()[0].m.(node.VoteResp); r.Granted {
		t.Fatal("second candidate in same term must be refused")
	}
	if v, _ := x.n.VotedFor(); v != 2 {
		t.Fatalf("votedFor=%d", v)
	}
}

/** @id TEST-ELECT-005 @verifies REQ-ELECT-005 */
func TestTEST_ELECT_005_higherTerm(t *testing.T) {
	x := newH(1, 2, 3)
	x.tick(100) // candidate in term 1, voted for self
	x.take()
	x.n.Step(2, node.VoteResp{Term: 5, Granted: false})
	if x.n.Role() != node.Follower || x.n.Term() != 5 {
		t.Fatalf("role=%v term=%d", x.n.Role(), x.n.Term())
	}
	if _, ok := x.n.VotedFor(); ok {
		t.Fatal("vote must be cleared")
	}
	// vote cleared before processing: a fresh request in the same new term can be granted
	x.n.Step(3, node.RequestVote{Term: 6, Candidate: 3})
	if r := x.take()[0].m.(node.VoteResp); !r.Granted || r.Term != 6 {
		t.Fatalf("%+v", r)
	}
}

/** @id TEST-ELECT-006 @verifies REQ-ELECT-006 */
func TestTEST_ELECT_006_staleRequest(t *testing.T) {
	x := newH(1, 2, 3)
	x.n.Step(2, node.RequestVote{Term: 4, Candidate: 2})
	x.take()
	x.n.Step(3, node.RequestVote{Term: 3, Candidate: 3})
	r := x.take()[0].m.(node.VoteResp)
	if r.Granted || r.Term != 4 || x.n.Term() != 4 {
		t.Fatalf("%+v term=%d", r, x.n.Term())
	}
	if v, _ := x.n.VotedFor(); v != 2 {
		t.Fatalf("vote changed to %d", v)
	}
}

/** @id TEST-ELECT-007 @verifies REQ-ELECT-007 */
func TestTEST_ELECT_007_majority(t *testing.T) {
	x := newH(1, 2, 3, 4, 5)
	x.tick(100)
	x.n.Step(2, node.VoteResp{Term: 1, Granted: true})
	if x.n.Role() != node.Candidate {
		t.Fatal("2 of 5 is not a majority")
	}
	x.n.Step(3, node.VoteResp{Term: 1, Granted: false})
	if x.n.Role() != node.Candidate {
		t.Fatal("refusal must not count")
	}
	x.n.Step(4, node.VoteResp{Term: 1, Granted: true})
	if x.n.Role() != node.Leader {
		t.Fatalf("3 of 5 must win, role=%v", x.n.Role())
	}
	if l, ok := x.n.Leader(); !ok || l != 1 {
		t.Fatalf("leader=%d,%v", l, ok)
	}
	y := newH(1, 2, 3)
	y.tick(100)
	y.n.Step(2, node.VoteResp{Term: 1, Granted: true})
	if y.n.Role() != node.Leader {
		t.Fatal("2 of 3 must win")
	}
}

/** @id TEST-ELECT-008 @verifies REQ-ELECT-008 */
func TestTEST_ELECT_008_timerReset(t *testing.T) {
	x := newH(1, 2, 3)
	x.tick(60)
	x.n.Step(2, node.RequestVote{Term: 1, Candidate: 2})
	x.tick(99)
	if x.n.Role() != node.Follower {
		t.Fatal("granted vote must restart the timer")
	}
	x.tick(1)
	if x.n.Role() != node.Candidate {
		t.Fatal("timer must fire 100 after the grant")
	}
	y := newH(1, 2, 3)
	y.n.Log().Append(1, "a")
	y.tick(60)
	y.n.Step(2, node.RequestVote{Term: 1, Candidate: 2}) // log behind: refused
	y.tick(40)
	if y.n.Role() != node.Candidate {
		t.Fatal("refused vote must not restart the timer")
	}
}

/** @id TEST-ELECT-009 @verifies REQ-ELECT-009 */
func TestTEST_ELECT_009_splitVote(t *testing.T) {
	x := newH(1, 2, 3, 4, 5)
	x.tick(100)
	x.n.Step(2, node.VoteResp{Term: 1, Granted: true})
	x.take()
	x.tick(100)
	if x.n.Role() != node.Candidate || x.n.Term() != 2 {
		t.Fatalf("role=%v term=%d", x.n.Role(), x.n.Term())
	}
	if len(x.take()) != 4 {
		t.Fatal("must re-broadcast")
	}
	x.n.Step(3, node.VoteResp{Term: 2, Granted: true})
	if x.n.Role() != node.Candidate {
		t.Fatal("old tally must be discarded (self + 1 of 5)")
	}
}

/** @id TEST-ELECT-010 @verifies REQ-ELECT-010 */
func TestTEST_ELECT_010_stepDown(t *testing.T) {
	x := newH(1, 2, 3)
	x.tick(100)
	x.take()
	x.n.Step(2, node.AppendEntries{Term: 0, Leader: 2})
	if x.n.Role() != node.Candidate {
		t.Fatal("older-term AppendEntries must not demote")
	}
	x.take()
	x.n.Step(2, node.AppendEntries{Term: 1, Leader: 2})
	if x.n.Role() != node.Follower || x.n.Term() != 1 {
		t.Fatalf("role=%v term=%d", x.n.Role(), x.n.Term())
	}
	if l, ok := x.n.Leader(); !ok || l != 2 {
		t.Fatalf("leader=%d,%v", l, ok)
	}
}

/** @id TEST-ELECT-011 @verifies REQ-ELECT-011 */
func TestTEST_ELECT_011_ignoredVotes(t *testing.T) {
	x := newH(1, 2, 3, 4, 5)
	x.tick(100)
	x.tick(100) // term 2
	x.n.Step(2, node.VoteResp{Term: 1, Granted: true})
	x.n.Step(3, node.VoteResp{Term: 2, Granted: true})
	x.n.Step(3, node.VoteResp{Term: 2, Granted: true})
	x.n.Step(9, node.VoteResp{Term: 2, Granted: true})
	if x.n.Role() != node.Candidate {
		t.Fatalf("stale/duplicate/non-peer votes counted, role=%v", x.n.Role())
	}
	x.n.Step(4, node.VoteResp{Term: 2, Granted: true})
	if x.n.Role() != node.Leader {
		t.Fatal("3 distinct valid votes must win")
	}
}

/** @id TEST-ELECT-012 @verifies REQ-ELECT-012 */
func TestTEST_ELECT_012_singleNode(t *testing.T) {
	x := newH(1)
	x.tick(100)
	if x.n.Role() != node.Leader || x.n.Term() != 1 {
		t.Fatalf("role=%v term=%d", x.n.Role(), x.n.Term())
	}
}
