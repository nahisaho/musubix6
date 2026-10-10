package node_test

import (
	"reflect"
	"testing"

	"raftsim/clock"
	"raftsim/node"
	"raftsim/rlog"
)

type ra struct {
	*h
	applied []uint64
	cmds    []string
}

// newRA is newH plus an Apply recorder.
func newRA(id int, peers ...int) *ra {
	x := &ra{h: &h{c: clock.New()}}
	x.n = node.New(node.Config{
		ID: id, Peers: peers, Clock: x.c, Seed: 7,
		ElectionMin: 100, ElectionMax: 100, Heartbeat: 20,
		Send: func(to int, m any) { x.out = append(x.out, out{to, m}) },
		Apply: func(idx uint64, e rlog.Entry) {
			x.applied = append(x.applied, idx)
			x.cmds = append(x.cmds, e.Cmd)
		},
	})
	x.n.Start()
	return x
}

// elect makes the node Leader of term 1 (or the given extra rounds later) and drains output.
func (x *ra) elect(term uint64, grants ...int) {
	for i := uint64(0); i < term; i++ {
		x.tick(100)
	}
	for _, g := range grants {
		x.n.Step(g, node.VoteResp{Term: term, Granted: true})
	}
}

func aes(o []out) map[int]node.AppendEntries {
	m := map[int]node.AppendEntries{}
	for _, e := range o {
		if a, ok := e.m.(node.AppendEntries); ok {
			m[e.to] = a
		}
	}
	return m
}

/** @id TEST-REPL-001 @verifies REQ-REPL-001 */
func TestTEST_REPL_001_heartbeats(t *testing.T) {
	x := newRA(1, 2, 3)
	x.n.Log().Append(1, "a")
	x.elect(1, 2)
	got := aes(x.take())
	if len(got) != 2 {
		t.Fatalf("want AE to both peers, got %v", got)
	}
	for _, p := range []int{2, 3} {
		a := got[p]
		if a.Term != 1 || a.Leader != 1 || a.PrevIdx != 1 || a.PrevTerm != 1 || len(a.Entries) != 0 || a.Commit != 0 {
			t.Fatalf("peer %d: %+v", p, a)
		}
	}
	x.tick(19)
	if len(x.take()) != 0 {
		t.Fatal("heartbeat early")
	}
	x.tick(1)
	if len(aes(x.take())) != 2 {
		t.Fatal("missing heartbeat at 20")
	}
	x.tick(20)
	if len(aes(x.take())) != 2 {
		t.Fatal("missing heartbeat at 40")
	}
	x.n.Step(3, node.RequestVote{Term: 9, Candidate: 3, LastIdx: 5, LastTerm: 9})
	x.take()
	x.tick(40)
	if len(aes(x.take())) != 0 {
		t.Fatal("deposed leader must stop heartbeats")
	}
}

/** @id TEST-REPL-002 @verifies REQ-REPL-002 */
func TestTEST_REPL_002_propose(t *testing.T) {
	x := newRA(1, 2, 3)
	if idx, err := x.n.Propose("nope"); idx != 0 || err != node.ErrNotLeader || x.n.Log().LastIndex() != 0 {
		t.Fatalf("follower propose: %d %v", idx, err)
	}
	x.elect(1, 2)
	x.take()
	idx, err := x.n.Propose("x")
	if idx != 1 || err != nil {
		t.Fatalf("idx=%d err=%v", idx, err)
	}
	e, _ := x.n.Log().Get(1)
	if e.Term != 1 || e.Cmd != "x" {
		t.Fatalf("%+v", e)
	}
	got := aes(x.take())
	for _, p := range []int{2, 3} {
		if len(got[p].Entries) != 1 || got[p].Entries[0].Cmd != "x" || got[p].PrevIdx != 0 {
			t.Fatalf("peer %d: %+v", p, got[p])
		}
	}
}

/** @id TEST-REPL-003 @verifies REQ-REPL-003 */
func TestTEST_REPL_003_staleAppend(t *testing.T) {
	x := newRA(1, 2, 3)
	x.n.Step(2, node.RequestVote{Term: 5, Candidate: 2})
	x.take()
	x.n.Step(3, node.AppendEntries{Term: 3, Leader: 3, Entries: []rlog.Entry{{Term: 3, Cmd: "z"}}})
	r := x.take()[0].m.(node.AppendResp)
	if r.Success || r.Term != 5 || x.n.Log().LastIndex() != 0 {
		t.Fatalf("%+v", r)
	}
	if _, ok := x.n.Leader(); ok {
		t.Fatal("stale sender must not become leader")
	}
}

/** @id TEST-REPL-004 @verifies REQ-REPL-004 */
func TestTEST_REPL_004_backtrack(t *testing.T) {
	x := newRA(1, 2, 3)
	x.n.Log().Append(1, "a")
	x.n.Log().Append(1, "b")
	x.elect(1, 2)
	x.take()
	step := func() node.AppendEntries {
		x.n.Step(2, node.AppendResp{Term: 1, Success: false})
		o := x.take()
		if len(o) != 1 || o[0].to != 2 {
			t.Fatalf("resend only to peer 2, got %+v", o)
		}
		return o[0].m.(node.AppendEntries)
	}
	a := step()
	if a.PrevIdx != 1 || len(a.Entries) != 1 || a.Entries[0].Cmd != "b" {
		t.Fatalf("%+v", a)
	}
	a = step()
	if a.PrevIdx != 0 || len(a.Entries) != 2 {
		t.Fatalf("%+v", a)
	}
	a = step()
	if a.PrevIdx != 0 || len(a.Entries) != 2 {
		t.Fatalf("must clamp at nextIndex 1: %+v", a)
	}
}

/** @id TEST-REPL-005 @verifies REQ-REPL-005 */
func TestTEST_REPL_005_followerMerge(t *testing.T) {
	x := newRA(1, 2, 3)
	x.n.Step(2, node.AppendEntries{Term: 1, Leader: 2, Entries: []rlog.Entry{{Term: 1, Cmd: "a"}, {Term: 1, Cmd: "b"}}})
	if r := x.take()[0].m.(node.AppendResp); !r.Success || r.Match != 2 || r.Term != 1 {
		t.Fatalf("%+v", r)
	}
	x.n.Step(3, node.AppendEntries{Term: 2, Leader: 3, PrevIdx: 1, PrevTerm: 1, Entries: []rlog.Entry{{Term: 2, Cmd: "z"}}})
	if r := x.take()[0].m.(node.AppendResp); !r.Success || r.Match != 2 {
		t.Fatalf("%+v", r)
	}
	if e, _ := x.n.Log().Get(2); e.Term != 2 || e.Cmd != "z" || x.n.Log().LastIndex() != 2 {
		t.Fatalf("conflict not replaced: %+v", e)
	}
	x.n.Step(3, node.AppendEntries{Term: 2, Leader: 3, PrevIdx: 5, PrevTerm: 2})
	if r := x.take()[0].m.(node.AppendResp); r.Success {
		t.Fatal("gap must be rejected")
	}
}

/** @id TEST-REPL-006 @verifies REQ-REPL-006 */
func TestTEST_REPL_006_matchIndex(t *testing.T) {
	x := newRA(1, 2, 3)
	x.elect(1, 2)
	x.n.Propose("a")
	x.n.Propose("b")
	x.take()
	x.n.Step(2, node.AppendResp{Term: 1, Success: true, Match: 2})
	x.take()
	x.tick(20)
	got := aes(x.take())
	if got[2].PrevIdx != 2 || got[3].PrevIdx != 0 {
		t.Fatalf("peer2 prev=%d peer3 prev=%d", got[2].PrevIdx, got[3].PrevIdx)
	}
}

/** @id TEST-REPL-007 @verifies REQ-REPL-007 */
func TestTEST_REPL_007_leaderCommit(t *testing.T) {
	x := newRA(1, 2, 3, 4, 5)
	x.elect(1, 2, 3)
	x.n.Propose("a")
	x.take()
	x.n.Step(2, node.AppendResp{Term: 1, Success: true, Match: 1})
	if x.n.CommitIndex() != 0 {
		t.Fatal("2 of 5 must not commit")
	}
	x.n.Step(3, node.AppendResp{Term: 1, Success: true, Match: 1})
	if x.n.CommitIndex() != 1 {
		t.Fatalf("3 of 5 must commit, commit=%d", x.n.CommitIndex())
	}
	x.n.Propose("b")
	x.n.Propose("c")
	x.n.Step(4, node.AppendResp{Term: 1, Success: true, Match: 3})
	x.n.Step(5, node.AppendResp{Term: 1, Success: true, Match: 2})
	if x.n.CommitIndex() != 2 {
		t.Fatalf("highest majority index is 2, commit=%d", x.n.CommitIndex())
	}
	x.n.Step(2, node.AppendResp{Term: 1, Success: true, Match: 3})
	if x.n.CommitIndex() != 3 {
		t.Fatalf("commit=%d", x.n.CommitIndex())
	}
}

/** @id TEST-REPL-008 @verifies REQ-REPL-008 */
func TestTEST_REPL_008_followerCommit(t *testing.T) {
	x := newRA(1, 2, 3)
	x.n.Step(2, node.AppendEntries{Term: 1, Leader: 2, Entries: []rlog.Entry{{Term: 1, Cmd: "a"}, {Term: 1, Cmd: "b"}}, Commit: 5})
	if x.n.CommitIndex() != 2 {
		t.Fatalf("commit=%d want min(5,2)", x.n.CommitIndex())
	}
	x.n.Step(2, node.AppendEntries{Term: 1, Leader: 2, PrevIdx: 2, PrevTerm: 1, Commit: 1})
	if x.n.CommitIndex() != 2 {
		t.Fatal("commit must never decrease")
	}
	y := newRA(1, 2, 3)
	for i := 0; i < 3; i++ {
		y.n.Log().Append(1, "old")
	}
	y.n.Step(2, node.AppendEntries{Term: 2, Leader: 2, PrevIdx: 1, PrevTerm: 1, Commit: 3})
	if y.n.CommitIndex() != 1 {
		t.Fatalf("only the verified prefix may commit, commit=%d", y.n.CommitIndex())
	}
}

/** @id TEST-REPL-009 @verifies REQ-REPL-009 */
func TestTEST_REPL_009_applyOnce(t *testing.T) {
	x := newRA(1, 2, 3)
	ents := []rlog.Entry{{Term: 1, Cmd: "a"}, {Term: 1, Cmd: "b"}, {Term: 1, Cmd: "c"}}
	x.n.Step(2, node.AppendEntries{Term: 1, Leader: 2, Entries: ents, Commit: 2})
	x.n.Step(2, node.AppendEntries{Term: 1, Leader: 2, Entries: ents, Commit: 2})
	x.n.Step(2, node.AppendEntries{Term: 1, Leader: 2, PrevIdx: 3, PrevTerm: 1, Commit: 3})
	if !reflect.DeepEqual(x.applied, []uint64{1, 2, 3}) || !reflect.DeepEqual(x.cmds, []string{"a", "b", "c"}) {
		t.Fatalf("applied %v %v", x.applied, x.cmds)
	}
	l := newRA(1, 2, 3)
	l.elect(1, 2)
	l.n.Propose("p")
	l.n.Propose("q")
	l.n.Step(2, node.AppendResp{Term: 1, Success: true, Match: 2})
	l.n.Step(3, node.AppendResp{Term: 1, Success: true, Match: 2})
	if !reflect.DeepEqual(l.applied, []uint64{1, 2}) {
		t.Fatalf("leader applied %v", l.applied)
	}
}

/** @id TEST-REPL-010 @verifies REQ-REPL-010 */
func TestTEST_REPL_010_timerAndLeader(t *testing.T) {
	x := newRA(1, 2, 3)
	x.tick(60)
	x.n.Step(2, node.AppendEntries{Term: 1, Leader: 2})
	if l, ok := x.n.Leader(); !ok || l != 2 {
		t.Fatalf("leader=%d,%v", l, ok)
	}
	x.tick(99)
	if x.n.Role() != node.Follower {
		t.Fatal("heartbeat must restart the timer")
	}
	x.n.Step(3, node.AppendEntries{Term: 0, Leader: 3})
	x.tick(1)
	if x.n.Role() != node.Candidate {
		t.Fatal("older-term AppendEntries must not restart the timer")
	}
}

/** @id TEST-REPL-011 @verifies REQ-REPL-011 */
func TestTEST_REPL_011_singleNodeCommit(t *testing.T) {
	x := newRA(1)
	x.tick(100)
	idx, err := x.n.Propose("solo")
	if idx != 1 || err != nil || x.n.CommitIndex() != 1 || !reflect.DeepEqual(x.cmds, []string{"solo"}) {
		t.Fatalf("idx=%d err=%v commit=%d cmds=%v", idx, err, x.n.CommitIndex(), x.cmds)
	}
}

/** @id TEST-REPL-012 @verifies REQ-REPL-012 */
func TestTEST_REPL_012_noOldTermCommit(t *testing.T) {
	x := newRA(1, 2, 3)
	x.n.Log().Append(1, "old") // entry from an earlier term
	x.elect(2, 2)              // leader of term 2
	x.take()
	x.n.Step(2, node.AppendResp{Term: 2, Success: true, Match: 1})
	x.n.Step(3, node.AppendResp{Term: 2, Success: true, Match: 1})
	if x.n.CommitIndex() != 0 {
		t.Fatalf("old-term entry committed by counting replicas: commit=%d", x.n.CommitIndex())
	}
	x.n.Propose("new")
	x.n.Step(2, node.AppendResp{Term: 2, Success: true, Match: 2})
	if x.n.CommitIndex() != 2 || !reflect.DeepEqual(x.applied, []uint64{1, 2}) {
		t.Fatalf("commit=%d applied=%v", x.n.CommitIndex(), x.applied)
	}
}

/** @id TEST-REPL-013 @verifies REQ-REPL-013 */
func TestTEST_REPL_013_staleResponses(t *testing.T) {
	x := newRA(1, 2, 3)
	x.elect(1, 2)
	x.n.Propose("a")
	x.n.Propose("b")
	x.take()
	x.n.Step(2, node.AppendResp{Term: 1, Success: true, Match: 2})
	x.n.Step(2, node.AppendResp{Term: 1, Success: true, Match: 1}) // reordered, older
	x.n.Step(9, node.AppendResp{Term: 1, Success: true, Match: 2}) // non-peer
	x.take()
	x.tick(20)
	if got := aes(x.take()); got[2].PrevIdx != 2 {
		t.Fatalf("matchIndex regressed: prev=%d", got[2].PrevIdx)
	}
	x.n.Step(3, node.AppendResp{Term: 0, Success: false}) // old term, must not backtrack
	if len(x.take()) != 0 {
		t.Fatal("old-term rejection must be ignored")
	}
	x.n.Step(9, node.AppendResp{Term: 1, Success: false})
	if len(x.take()) != 0 {
		t.Fatal("non-peer rejection must be ignored")
	}
	if x.n.CommitIndex() != 2 {
		t.Fatalf("commit=%d", x.n.CommitIndex())
	}
}
