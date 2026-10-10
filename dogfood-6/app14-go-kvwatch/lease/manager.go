package lease

import (
	"errors"
	"sort"
	"sync"

	"kvwatch/mvcc"
)

const MinTTL int64 = 2

var (
	ErrTTLTooSmall   = errors.New("lease: ttl too small")
	ErrLeaseNotFound = errors.New("lease: not found")
	ErrLeaseExpired  = errors.New("lease: expired")
)

type entry struct {
	ttl    int64
	expiry int64
	keys   map[string]struct{}
}

type Manager struct {
	mu     sync.Mutex
	store  *mvcc.Store
	now    func() int64
	next   int64
	leases map[int64]*entry
}

func NewManager(s *mvcc.Store, now func() int64) *Manager {
	return &Manager{store: s, now: now, leases: map[int64]*entry{}}
}

// @id CODE-LEASE-001 @implements REQ-LEASE-001
func (m *Manager) Grant(ttl int64) (int64, error) {
	if ttl < MinTTL {
		return 0, ErrTTLTooSmall
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.next++
	m.leases[m.next] = &entry{ttl: ttl, expiry: m.now() + ttl, keys: map[string]struct{}{}}
	return m.next, nil
}

// @id CODE-LEASE-002 @implements REQ-LEASE-002 REQ-LEASE-008 REQ-LEASE-010
func (m *Manager) Put(key, value string, id int64) (mvcc.KeyValue, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id != 0 {
		e, ok := m.leases[id]
		if !ok {
			return mvcc.KeyValue{}, ErrLeaseNotFound
		}
		if m.now() >= e.expiry {
			return mvcc.KeyValue{}, ErrLeaseExpired
		}
	}
	res, err := m.store.ApplyOps([]mvcc.Op{{Kind: mvcc.OpPut, Key: key, Value: value, Lease: id}})
	if err != nil {
		return mvcc.KeyValue{}, err
	}
	if prev := res.Events[0].PrevKV; prev != nil && prev.Lease != 0 && prev.Lease != id {
		if old, ok := m.leases[prev.Lease]; ok {
			delete(old.keys, key)
		}
	}
	if id != 0 {
		m.leases[id].keys[key] = struct{}{}
	}
	return res.Events[0].KV, nil
}

// Attach records key under an existing lease (the key's stored KeyValue.Lease is authoritative).
func (m *Manager) Attach(id int64, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.leases[id]
	if !ok {
		return ErrLeaseNotFound
	}
	e.keys[key] = struct{}{}
	return nil
}

func (m *Manager) Exists(id int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.leases[id]
	return ok
}

// @id CODE-LEASE-003 @implements REQ-LEASE-003 REQ-LEASE-004
func (m *Manager) Revoke(id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.revokeLocked(id)
}

// revokeLocked deletes only keys whose stored lease is still id, in one revision.
func (m *Manager) revokeLocked(id int64) error {
	e, ok := m.leases[id]
	if !ok {
		return ErrLeaseNotFound
	}
	_, err := m.store.Apply(func(r mvcc.Reader) []mvcc.Op {
		var ops []mvcc.Op
		for _, k := range sortedKeys(e.keys) {
			if kv, live := r.Get(k); live && kv.Lease == id {
				ops = append(ops, mvcc.Op{Kind: mvcc.OpDelete, Key: k})
			}
		}
		return ops
	})
	delete(m.leases, id)
	return err
}

func sortedKeys(set map[string]struct{}) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// @id CODE-LEASE-004 @implements REQ-LEASE-005 REQ-LEASE-007
func (m *Manager) KeepAlive(id int64) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.leases[id]
	if !ok {
		return 0, ErrLeaseNotFound
	}
	now := m.now()
	if now >= e.expiry {
		return 0, ErrLeaseExpired
	}
	e.expiry = now + e.ttl
	return e.ttl, nil
}

// @id CODE-LEASE-005 @implements REQ-LEASE-006
func (m *Manager) Expire(now int64) []int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	var due []int64
	for id, e := range m.leases {
		if e.expiry <= now {
			due = append(due, id)
		}
	}
	sort.Slice(due, func(i, j int) bool {
		a, b := m.leases[due[i]], m.leases[due[j]]
		if a.expiry != b.expiry {
			return a.expiry < b.expiry
		}
		return due[i] < due[j]
	})
	for _, id := range due {
		m.revokeLocked(id)
	}
	return due
}

// @id CODE-LEASE-006 @implements REQ-LEASE-009
func (m *Manager) TimeToLive(id int64) (int64, []string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.leases[id]
	if !ok {
		return 0, nil, ErrLeaseNotFound
	}
	rem := e.expiry - m.now()
	if rem < 0 {
		rem = 0
	}
	keys := []string{}
	for _, k := range sortedKeys(e.keys) {
		if kv, live, _ := m.store.Get(k, 0); live && kv.Lease == id {
			keys = append(keys, k)
		}
	}
	return rem, keys, nil
}
