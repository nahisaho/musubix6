package machine

import (
	"encoding/json"
	"errors"
	"example.org/paxos/paxos"
	"strings"
)

// @id CODE-MACHINE-001 @implements REQ-MACHINE-001 REQ-MACHINE-002 REQ-MACHINE-003 REQ-MACHINE-004 REQ-MACHINE-005 REQ-MACHINE-006 REQ-MACHINE-007 REQ-MACHINE-008
type Command struct {
	Client                   string
	Seq                      int
	Kind, Key, Value, Expect string
}
type Result struct {
	Value string
	OK    bool
}
type cached struct {
	seq    int
	result Result
}
type Machine struct {
	values  map[string]string
	clients map[string]cached
}

func New() *Machine { return &Machine{values: map[string]string{}, clients: map[string]cached{}} }
func (m *Machine) Apply(cmd Command) (Result, error) {
	if cmd.Client == "" || cmd.Seq <= 0 {
		return Result{}, errors.New("invalid client sequence")
	}
	if old, ok := m.clients[cmd.Client]; ok {
		if cmd.Seq == old.seq {
			return old.result, nil
		}
		if cmd.Seq < old.seq {
			return Result{}, errors.New("stale sequence")
		}
	}
	value := m.values[cmd.Key]
	r := Result{Value: value, OK: true}
	switch cmd.Kind {
	case "get":
	case "put":
		m.values[cmd.Key] = cmd.Value
		r.Value = cmd.Value
	case "cas":
		r.OK = value == cmd.Expect
		if r.OK {
			m.values[cmd.Key] = cmd.Value
			r.Value = cmd.Value
		}
	default:
		return Result{}, errors.New("unknown command")
	}
	m.clients[cmd.Client] = cached{cmd.Seq, r}
	return r, nil
}
func (m *Machine) Value(key string) string { return m.values[key] }

type Service struct {
	State   *Machine
	Cluster *paxos.Cluster
	applied int
}

func NewService(c *paxos.Cluster) *Service { return &Service{State: New(), Cluster: c} }
func (s *Service) Submit(cmd Command) (Result, error) {
	b, err := json.Marshal(cmd)
	if err != nil {
		return Result{}, err
	}
	slot, err := s.Cluster.Propose(string(b))
	if err != nil {
		return Result{}, err
	}
	var result Result
	var targetError error
	for s.applied < slot {
		s.applied++
		value := s.Cluster.Chosen[s.applied]
		if strings.HasPrefix(value, "@") {
			continue
		}
		var decoded Command
		if err = json.Unmarshal([]byte(value), &decoded); err != nil {
			return Result{}, err
		}
		r, e := s.State.Apply(decoded)
		if s.applied == slot {
			result, targetError = r, e
		}
	}
	return result, targetError
}
