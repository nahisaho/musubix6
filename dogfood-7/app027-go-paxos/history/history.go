package history

import (
	"errors"
	"example.org/paxos/machine"
)

// @id CODE-HISTORY-001 @implements REQ-HISTORY-001 REQ-HISTORY-002 REQ-HISTORY-003 REQ-HISTORY-004 REQ-HISTORY-005 REQ-HISTORY-006 REQ-HISTORY-007 REQ-HISTORY-008
type Status string

const (
	Legal   Status = "legal"
	Illegal Status = "illegal"
	Unknown Status = "unknown"
)

type Op struct {
	ID, Call, Return int
	Pending          bool
	Command          machine.Command
	Result           machine.Result
}
type Verdict struct {
	Status  Status
	Witness []int
}

func step(state map[string]string, op Op) (map[string]string, bool) {
	next := map[string]string{}
	for k, v := range state {
		next[k] = v
	}
	cmd := op.Command
	value := next[cmd.Key]
	r := machine.Result{Value: value, OK: true}
	switch cmd.Kind {
	case "get":
	case "put":
		next[cmd.Key] = cmd.Value
		r.Value = cmd.Value
	case "cas":
		r.OK = value == cmd.Expect
		if r.OK {
			next[cmd.Key] = cmd.Value
			r.Value = cmd.Value
		}
	default:
		return nil, false
	}
	return next, op.Pending || r == op.Result
}
func Check(ops []Op, budget int) (Verdict, error) {
	complete, err := validate(ops, budget)
	if err != nil {
		return Verdict{}, err
	}
	pred := make([]uint64, len(ops))
	for i, a := range ops {
		for j, b := range ops {
			if i != j && precedes(b, a) {
				pred[i] |= 1 << j
			}
		}
	}
	remaining := budget
	unknown := false
	var witness []int
	var dfs func(uint64, map[string]string, []int) bool
	dfs = func(done uint64, state map[string]string, path []int) bool {
		if remaining == 0 {
			unknown = true
			return false
		}
		remaining--
		if done&complete == complete {
			witness = append([]int(nil), path...)
			return true
		}
		for i, op := range ops {
			bit := uint64(1) << i
			if done&bit != 0 || pred[i]&done != pred[i] {
				continue
			}
			next, ok := step(state, op)
			if !ok {
				continue
			}
			if dfs(done|bit, next, append(path, op.ID)) {
				return true
			}
		}
		return false
	}
	if dfs(0, map[string]string{}, nil) {
		return Verdict{Legal, witness}, nil
	}
	if unknown {
		return Verdict{Status: Unknown}, nil
	}
	return Verdict{Status: Illegal}, nil
}

// @id CODE-HISTORY-002 @implements REQ-HISTORY-009
func precedes(before, after Op) bool {
	return !before.Pending && before.Return < after.Call
}

// @id CODE-HISTORY-003 @implements REQ-HISTORY-008
func validate(ops []Op, budget int) (uint64, error) {
	if len(ops) > 63 || budget < 0 {
		return 0, errors.New("invalid history bounds")
	}
	ids := map[int]bool{}
	var complete uint64
	for i, op := range ops {
		if ids[op.ID] || op.Call < 0 || !op.Pending && op.Return < op.Call {
			return 0, errors.New("invalid operation")
		}
		ids[op.ID] = true
		if !op.Pending {
			complete |= 1 << i
		}
	}
	return complete, nil
}
