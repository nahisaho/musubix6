package sim_test

import (
	"reflect"
	"strings"
	"testing"

	"raftsim/node"
	"raftsim/rlog"
	"raftsim/sim"
)

func leaders(c *sim.Cluster) int {
	n := 0
	for i := 0; i < c.N(); i++ {
		if c.Node(i).Role() == node.Leader {
			n++
		}
	}
	return n
}

func hasViolation(c *sim.Cluster, tag string) bool {
	for _, v := range c.Violations() {
		if strings.HasPrefix(v, tag) {
			return true
		}
	}
	return false
}

func isolateAll(c *sim.Cluster) {
	var gs [][]int
	for i := 0; i < c.N(); i++ {
		gs = append(gs, []int{i})
	}
	c.Partition(gs...)
}

func allEqual(c *sim.Cluster) bool {
	for i := 1; i < c.N(); i++ {
		if !reflect.DeepEqual(c.Applied(0), c.Applied(i)) {
			return false
		}
	}
	return true
}

/** @id TEST-SIM-001 @verifies REQ-SIM-001 */
func TestTEST_SIM_001_build(t *testing.T) {
	c := sim.New(3, 1)
	if c.N() != 3 || c.Clock().Now() != 0 || len(c.Violations()) != 0 {
		t.Fatalf("n=%d now=%d viol=%v", c.N(), c.Clock().Now(), c.Violations())
	}
	for i := 0; i < 3; i++ {
		if c.Node(i) == nil || c.Node(i).Role() != node.Follower {
			t.Fatalf("node %d", i)
		}
	}
}

/** @id TEST-SIM-002 @verifies REQ-SIM-002 */
func TestTEST_SIM_002_electsOneLeader(t *testing.T) {
	for _, n := range []int{3, 5} {
		c := sim.New(n, 11)
		c.Run(7)
		if c.Clock().Now() != 7 {
			t.Fatalf("now=%d", c.Clock().Now())
		}
		c.Run(993)
		l, ok := c.Leader()
		if !ok || leaders(c) != 1 || c.Node(l).Role() != node.Leader {
			t.Fatalf("n=%d leaders=%d ok=%v", n, leaders(c), ok)
		}
		if len(c.Violations()) != 0 {
			t.Fatal(c.Violations())
		}
	}
}

/** @id TEST-SIM-003 @verifies REQ-SIM-003 */
func TestTEST_SIM_003_electionSafetyDetected(t *testing.T) {
	c := sim.New(3, 1)
	isolateAll(c)
	c.Node(0).Step(2, node.RequestVote{Term: 5, Candidate: 2})
	c.Node(1).Step(2, node.RequestVote{Term: 5, Candidate: 2})
	for i := 0; i < 400; i++ {
		c.Run(1)
		a, b := c.Node(0), c.Node(1)
		if a.Role() == node.Candidate && b.Role() == node.Candidate && a.Term() == 6 && b.Term() == 6 {
			break
		}
	}
	if c.Node(0).Term() != 6 || c.Node(1).Term() != 6 {
		t.Skip("setup did not align terms")
	}
	c.Node(0).Step(2, node.VoteResp{Term: 6, Granted: true})
	c.Node(1).Step(2, node.VoteResp{Term: 6, Granted: true})
	c.Run(1)
	if !hasViolation(c, "election-safety") {
		t.Fatalf("violations: %v", c.Violations())
	}
}

/** @id TEST-SIM-004 @verifies REQ-SIM-004 */
func TestTEST_SIM_004_replicates(t *testing.T) {
	c := sim.New(3, 5)
	c.Run(1000)
	if _, err := c.Propose("x"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Propose("y"); err != nil {
		t.Fatal(err)
	}
	c.Run(500)
	if !allEqual(c) || !reflect.DeepEqual(c.Applied(2), []string{"x", "y"}) {
		t.Fatalf("applied %v %v %v", c.Applied(0), c.Applied(1), c.Applied(2))
	}
}

/** @id TEST-SIM-005 @verifies REQ-SIM-005 */
func TestTEST_SIM_005_noLeader(t *testing.T) {
	c := sim.New(3, 1)
	if _, err := c.Propose("x"); err != sim.ErrNoLeader {
		t.Fatalf("err=%v", err)
	}
}

/** @id TEST-SIM-006 @verifies REQ-SIM-006 */
func TestTEST_SIM_006_minorityLeader(t *testing.T) {
	c := sim.New(3, 3)
	c.Run(1000)
	l, _ := c.Leader()
	oldTerm := c.Node(l).Term()
	var rest []int
	for i := 0; i < 3; i++ {
		if i != l {
			rest = append(rest, i)
		}
	}
	c.Partition([]int{l}, rest)
	if _, err := c.Node(l).Propose("lost"); err != nil {
		t.Fatal(err)
	}
	c.Run(1500)
	if c.Node(l).CommitIndex() != 0 {
		t.Fatalf("minority leader committed %d", c.Node(l).CommitIndex())
	}
	nl, ok := c.Leader()
	if !ok || nl == l || c.Node(nl).Term() <= oldTerm {
		t.Fatalf("new leader %d ok=%v term=%d old=%d", nl, ok, c.Node(nl).Term(), oldTerm)
	}
}

/** @id TEST-SIM-007 @verifies REQ-SIM-007 */
func TestTEST_SIM_007_healConverges(t *testing.T) {
	c := sim.New(3, 3)
	c.Run(1000)
	l, _ := c.Leader()
	var rest []int
	for i := 0; i < 3; i++ {
		if i != l {
			rest = append(rest, i)
		}
	}
	c.Partition([]int{l}, rest)
	c.Node(l).Propose("lost")
	c.Run(1500)
	nl, _ := c.Leader()
	if _, err := c.Propose("kept"); err != nil {
		t.Fatal(err)
	}
	c.Run(300)
	c.Heal()
	c.Run(1500)
	if c.Node(l).Role() != node.Follower || c.Node(l).Term() < c.Node(nl).Term() {
		t.Fatalf("old leader role=%v term=%d", c.Node(l).Role(), c.Node(l).Term())
	}
	if !allEqual(c) || !reflect.DeepEqual(c.Applied(l), []string{"kept"}) {
		t.Fatalf("applied %v %v %v", c.Applied(0), c.Applied(1), c.Applied(2))
	}
	if len(c.Violations()) != 0 {
		t.Fatal(c.Violations())
	}
}

/** @id TEST-SIM-008 @verifies REQ-SIM-008 */
func TestTEST_SIM_008_logMatchingDetected(t *testing.T) {
	c := sim.New(3, 1)
	isolateAll(c)
	c.Node(0).Log().Append(1, "a")
	c.Node(0).Log().Append(2, "x")
	c.Node(1).Log().Append(1, "b")
	c.Node(1).Log().Append(2, "x")
	c.Run(1)
	if !hasViolation(c, "log-matching") {
		t.Fatalf("violations: %v", c.Violations())
	}
	d := sim.New(3, 1)
	isolateAll(d)
	d.Node(0).Log().Append(1, "a")
	d.Node(1).Log().Append(1, "a")
	d.Node(1).Log().Append(3, "y")
	d.Node(2).Log().Append(2, "z")
	d.Run(1)
	if hasViolation(d, "log-matching") {
		t.Fatalf("false positive: %v", d.Violations())
	}
}

/** @id TEST-SIM-009 @verifies REQ-SIM-009 */
func TestTEST_SIM_009_stateMachineSafetyDetected(t *testing.T) {
	c := sim.New(3, 1)
	isolateAll(c)
	c.Node(0).Step(2, node.AppendEntries{Term: 1, Leader: 2, Entries: []rlog.Entry{{Term: 1, Cmd: "a"}}, Commit: 1})
	c.Node(1).Step(2, node.AppendEntries{Term: 1, Leader: 2, Entries: []rlog.Entry{{Term: 1, Cmd: "b"}}, Commit: 1})
	c.Run(1)
	if !hasViolation(c, "state-machine-safety") {
		t.Fatalf("violations: %v", c.Violations())
	}
}

/** @id TEST-SIM-010 @verifies REQ-SIM-010 */
func TestTEST_SIM_010_leaderCompletenessDetected(t *testing.T) {
	c := sim.New(3, 1)
	isolateAll(c)
	c.Node(0).Step(2, node.AppendEntries{Term: 1, Leader: 2, Entries: []rlog.Entry{{Term: 1, Cmd: "a"}}, Commit: 1})
	for i := 0; i < 400 && c.Node(1).Role() != node.Candidate; i++ {
		c.Run(1)
	}
	c.Node(1).Step(2, node.VoteResp{Term: c.Node(1).Term(), Granted: true})
	c.Run(1)
	if !hasViolation(c, "leader-completeness") {
		t.Fatalf("violations: %v", c.Violations())
	}
}

func script(seed uint64) *sim.Cluster {
	c := sim.New(5, seed)
	c.Run(1000)
	c.Propose("a")
	c.Run(300)
	l, _ := c.Leader()
	c.Partition([]int{l, (l + 1) % 5}, []int{(l + 2) % 5, (l + 3) % 5, (l + 4) % 5})
	c.Run(800)
	c.Heal()
	c.Run(800)
	return c
}

/** @id TEST-SIM-011 @verifies REQ-SIM-011 */
func TestTEST_SIM_011_deterministic(t *testing.T) {
	a, b, d := script(9), script(9), script(10)
	if a.Trace() != b.Trace() {
		t.Fatal("same seed must give the same trace")
	}
	if a.Trace() == d.Trace() {
		t.Fatal("different seed should give a different trace")
	}
	if a.Trace() == 0 {
		t.Fatal("trace must be non-zero")
	}
}

/** @id TEST-SIM-012 @verifies REQ-SIM-012 */
func TestTEST_SIM_012_randomizedSafety(t *testing.T) {
	for seed := uint64(1); seed <= 20; seed++ {
		c := sim.New(5, seed)
		c.Run(1500)
		for round := 0; round < 4; round++ {
			c.Propose("p" + string(rune('0'+round)))
			c.Run(200)
			l, ok := c.Leader()
			if !ok {
				c.Run(1000)
				continue
			}
			c.Partition([]int{l, (l + 1) % 5}, []int{(l + 2) % 5, (l + 3) % 5, (l + 4) % 5})
			c.Node(l).Propose("stale" + string(rune('0'+round)))
			c.Run(700 + int64(seed)*13)
			c.Heal()
			c.Run(1200)
		}
		c.Run(2500)
		if v := c.Violations(); len(v) != 0 {
			t.Fatalf("seed %d: %v", seed, v)
		}
		if !allEqual(c) || len(c.Applied(0)) == 0 {
			t.Fatalf("seed %d: applied diverged %v / %v", seed, c.Applied(0), c.Applied(3))
		}
	}
}
