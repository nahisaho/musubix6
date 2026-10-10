package tx

import "errors"

type Machine struct{ State byte }
type transition struct {
	to     byte
	tag    string
	reject bool
}

var table = map[byte]map[string]transition{
	'I': {"BEGIN": {'T', "BEGIN", false}, "COMMIT": {'I', "COMMIT", false}, "ROLLBACK": {'I', "ROLLBACK", false}, "QUERY": {'I', "", false}, "FAIL": {'I', "", false}},
	'T': {"BEGIN": {'T', "BEGIN", false}, "COMMIT": {'I', "COMMIT", false}, "ROLLBACK": {'I', "ROLLBACK", false}, "QUERY": {'T', "", false}, "FAIL": {'E', "", false}},
	'E': {"BEGIN": {'E', "", true}, "COMMIT": {'I', "ROLLBACK", false}, "ROLLBACK": {'I', "ROLLBACK", false}, "QUERY": {'E', "", true}, "FAIL": {'E', "", false}},
}

func New() *Machine { return &Machine{State: 'I'} }

// @id CODE-TX-001 @implements REQ-TX-001 REQ-TX-002 REQ-TX-003 REQ-TX-004 REQ-TX-005 REQ-TX-006 REQ-TX-007 REQ-TX-008 REQ-TX-009 REQ-TX-010
func (m *Machine) Apply(event string) (string, error) {
	step, ok := table[m.State][event]
	if !ok {
		return "", errors.New("08P01: unknown transaction event")
	}
	if step.reject {
		return "", errors.New("25P02: transaction aborted")
	}
	m.State = step.to
	return step.tag, nil
}
