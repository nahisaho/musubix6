package history

import (
	"example.org/paxos/machine"
	"example.org/paxos/paxos"
	"math/rand/v2"
	"testing"
)

// @id TEST-HISTORY-003 @verifies REQ-HISTORY-011 REQ-PAXOS-007 REQ-PAXOS-005 REQ-MACHINE-007
func TestTEST_HISTORY_003_IntegrationCorpus(t *testing.T) {
	for seed := uint64(1); seed <= 100; seed++ {
		rng := rand.New(rand.NewPCG(seed, seed+1))
		c := paxos.NewCluster([]int{1, 2, 3}, []int{1, 2, 3, 4, 5, 6})
		if err := c.Elect(1); err != nil {
			t.Fatal(err)
		}
		s := machine.NewService(c)
		var ops []Op
		var delayed string
		for seq := 1; seq <= 20; seq++ {
			if seq == 6 {
				old := c.Ballot
				if err := c.Reconfigure([]int{4, 5, 6}); err != nil {
					t.Fatal("disjoint membership", err)
				}
				if c.Nodes[1].Accept(old, 100, "stale") {
					t.Fatal("old ballot not fenced")
				}
				for _, id := range c.Config.Members() {
					c.Net.Send(1, id, delayed, 5)
				}
				c.Net.Run(100)
			}
			if seq%7 == 0 {
				voters := c.Config.Members()
				if err := c.Elect(voters[rng.IntN(len(voters))]); err != nil {
					t.Fatal("leader change", err)
				}
			}
			cmd := machine.Command{Client: "corpus", Seq: seq, Key: "x"}
			switch rng.IntN(3) {
			case 0:
				cmd.Kind, cmd.Value = "put", string(rune('a'+rng.IntN(4)))
			case 1:
				cmd.Kind = "get"
			case 2:
				cmd.Kind, cmd.Expect, cmd.Value = "cas", s.State.Value("x"), string(rune('a'+rng.IntN(4)))
			}
			result, err := s.Submit(cmd)
			if err != nil {
				t.Fatal(seed, seq, err)
			}
			ops = append(ops, Op{ID: seq, Call: seq * 3, Return: seq*3 + 1, Command: cmd, Result: result})
			if seq == 1 {
				for _, e := range c.Net.Trace() {
					if e.From == 1 && e.To == 2 {
						delayed = e.Value
					}
				}
			}
		}
		verdict, err := Check(ops, 10000)
		if err != nil || verdict.Status != Legal {
			t.Fatal("illegal simulator history", seed, verdict, err)
		}
		ops[len(ops)-1].Command.Kind = "get"
		ops[len(ops)-1].Result.Value = "impossible"
		if verdict, err = Check(ops, 10000); err != nil || verdict.Status != Illegal {
			t.Fatal("mutated corpus accepted", seed, verdict, err)
		}
	}
}
