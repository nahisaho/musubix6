package memtable

import (
	"sort"
	"sync"
)

type Record struct {
	Key     string
	Seq     uint64
	Value   []byte
	Deleted bool
}

func Clone(r Record) Record { r.Value = append([]byte(nil), r.Value...); return r }
func Less(a, b Record) bool {
	if a.Key == b.Key {
		return a.Seq > b.Seq
	}
	return a.Key < b.Key
}

// @id CODE-MEM-001 @implements REQ-MEM-001 REQ-MEM-002 REQ-MEM-003 REQ-MEM-004 REQ-MEM-005 REQ-MEM-006 REQ-MEM-007 REQ-MEM-008
type Table struct {
	mu   sync.RWMutex
	rows map[string][]Record
}

func New() *Table { return &Table{rows: make(map[string][]Record)} }
func (m *Table) Put(r Record) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r = Clone(r)
	vs := m.rows[r.Key]
	for i := range vs {
		if vs[i].Seq == r.Seq {
			vs[i] = r
			m.rows[r.Key] = vs
			return
		}
	}
	vs = append(vs, r)
	sort.Slice(vs, func(i, j int) bool { return vs[i].Seq > vs[j].Seq })
	m.rows[r.Key] = vs
}
func (m *Table) Get(k string, seq uint64) (Record, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, r := range m.rows[k] {
		if r.Seq <= seq {
			return Clone(r), !r.Deleted
		}
	}
	return Record{}, false
}
func (m *Table) Scan(start, end string, seq uint64) []Record {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []Record
	for k, rs := range m.rows {
		if k < start || (end != "" && k >= end) {
			continue
		}
		for _, r := range rs {
			if r.Seq <= seq {
				if !r.Deleted {
					out = append(out, Clone(r))
				}
				break
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}
func (m *Table) All() []Record {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []Record
	for _, vs := range m.rows {
		for _, r := range vs {
			out = append(out, Clone(r))
		}
	}
	sort.Slice(out, func(i, j int) bool { return Less(out[i], out[j]) })
	return out
}
