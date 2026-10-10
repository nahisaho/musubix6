package txn

import (
	"errors"
	"strings"

	"kvwatch/lease"
	"kvwatch/mvcc"
)

var (
	ErrDuplicateKey = errors.New("txn: duplicate key in branch")
	ErrBadCompare   = errors.New("txn: invalid compare")
)

type Target int

const (
	TargetVersion Target = iota
	TargetCreate
	TargetMod
	TargetValue
	TargetLease
)

type Cmp int

const (
	Equal Cmp = iota
	NotEqual
	Greater
	Less
)

type Compare struct {
	Key    string
	Target Target
	Op     Cmp
	Int    int64
	Value  string
}

type OpKind int

const (
	OpGet OpKind = iota
	OpPut
	OpDelete
)

type Op struct {
	Kind  OpKind
	Key   string
	Value string
	Lease int64
}

type Txn struct {
	Compares []Compare
	Then     []Op
	Else     []Op
}

type OpResult struct {
	KV      *mvcc.KeyValue
	Deleted int
}

type Response struct {
	Succeeded bool
	Revision  int64
	Results   []OpResult
}

type Engine struct {
	store  *mvcc.Store
	leases *lease.Manager
}

func New(s *mvcc.Store, m *lease.Manager) *Engine { return &Engine{store: s, leases: m} }

func cmpInt(op Cmp, a, b int64) bool {
	switch op {
	case Equal:
		return a == b
	case NotEqual:
		return a != b
	case Greater:
		return a > b
	}
	return a < b
}

// holds evaluates one compare; a missing key is 0 for numeric targets and never satisfies a Value compare.
// @id CODE-TXN-001 @implements REQ-TXN-003 REQ-TXN-004
func (c Compare) holds(r mvcc.Reader) bool {
	kv, ok := r.Get(c.Key)
	switch c.Target {
	case TargetValue:
		if !ok {
			return false
		}
		return cmpInt(c.Op, int64(strings.Compare(kv.Value, c.Value)), 0)
	case TargetVersion:
		return cmpInt(c.Op, kv.Version, c.Int)
	case TargetCreate:
		return cmpInt(c.Op, kv.CreateRev, c.Int)
	case TargetMod:
		return cmpInt(c.Op, kv.ModRev, c.Int)
	}
	return cmpInt(c.Op, kv.Lease, c.Int)
}

// @id CODE-TXN-002 @implements REQ-TXN-006 REQ-TXN-008
func (e *Engine) validate(t Txn) error {
	for _, c := range t.Compares {
		if c.Target < TargetVersion || c.Target > TargetLease || c.Op < Equal || c.Op > Less {
			return ErrBadCompare
		}
	}
	for _, branch := range [][]Op{t.Then, t.Else} {
		seen := map[string]bool{}
		for _, op := range branch {
			if op.Kind == OpGet {
				continue
			}
			if seen[op.Key] {
				return ErrDuplicateKey
			}
			seen[op.Key] = true
			if op.Kind == OpPut && op.Lease != 0 && !e.leases.Exists(op.Lease) {
				return lease.ErrLeaseNotFound
			}
		}
	}
	return nil
}

// Do decides the branch inside the store's write lock so compare and writes are one atomic step.
// @id CODE-TXN-003 @implements REQ-TXN-001 REQ-TXN-002 REQ-TXN-005 REQ-TXN-007 REQ-TXN-009
func (e *Engine) Do(t Txn) (Response, error) {
	if err := e.validate(t); err != nil {
		return Response{}, err
	}
	var resp Response
	var chosen []Op
	res, err := e.store.Apply(func(r mvcc.Reader) []mvcc.Op {
		resp.Succeeded = true
		for _, c := range t.Compares {
			if !c.holds(r) {
				resp.Succeeded = false
				break
			}
		}
		chosen = t.Else
		if resp.Succeeded {
			chosen = t.Then
		}
		var writes []mvcc.Op
		resp.Results = make([]OpResult, len(chosen))
		for i, op := range chosen {
			kv, live := r.Get(op.Key)
			switch op.Kind {
			case OpGet:
				if live {
					resp.Results[i].KV = &kv
				}
			case OpPut:
				writes = append(writes, mvcc.Op{Kind: mvcc.OpPut, Key: op.Key, Value: op.Value, Lease: op.Lease})
			case OpDelete:
				if live {
					resp.Results[i].Deleted = 1
				}
				writes = append(writes, mvcc.Op{Kind: mvcc.OpDelete, Key: op.Key})
			}
		}
		return writes
	})
	if err != nil {
		return Response{}, err
	}
	resp.Revision = res.Rev
	for _, op := range chosen {
		if op.Kind == OpPut && op.Lease != 0 {
			e.leases.Attach(op.Lease, op.Key)
		}
	}
	return resp, nil
}
