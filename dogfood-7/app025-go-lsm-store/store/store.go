package store

import (
	"dogfood/lsm/memtable"
	"dogfood/lsm/sstable"
	"dogfood/lsm/wal"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

// @id CODE-ENGINE-001 @implements REQ-ENGINE-001 REQ-ENGINE-002 REQ-ENGINE-003 REQ-ENGINE-004 REQ-ENGINE-005 REQ-ENGINE-006 REQ-ENGINE-007 REQ-ENGINE-008
type DB struct {
	mu       sync.Mutex
	dir      string
	mem      *memtable.Table
	log      *wal.Log
	tables   []*sstable.Table
	manifest manifest
	seq      uint64
	closed   bool
}
type manifest struct {
	Files      []string
	Generation uint64
}
type Snapshot struct{ Seq uint64 }
type Iterator struct {
	rows []memtable.Record
	at   int
}

func Open(d string) (*DB, error) {
	if err := os.MkdirAll(d, 0755); err != nil {
		return nil, err
	}
	l, err := wal.Open(filepath.Join(d, "wal.log"))
	if err != nil {
		return nil, err
	}
	db := &DB{dir: d, mem: memtable.New(), log: l}
	cleanup := func(err error) (*DB, error) { l.Close(); return nil, err }
	b, err := os.ReadFile(filepath.Join(d, "manifest.json"))
	if err != nil && !os.IsNotExist(err) {
		return cleanup(err)
	}
	if err == nil {
		if err = json.Unmarshal(b, &db.manifest); err != nil {
			return cleanup(err)
		}
	}
	for _, name := range db.manifest.Files {
		if filepath.Base(name) != name {
			return cleanup(errors.New("invalid table path"))
		}
		s, err := sstable.Open(filepath.Join(d, name))
		if err != nil {
			return cleanup(err)
		}
		db.tables = append(db.tables, s)
	}
	rs, err := wal.Recover(filepath.Join(d, "wal.log"))
	if err != nil {
		return cleanup(err)
	}
	for _, r := range rs {
		db.mem.Put(r)
	}
	db.restoreHighWatermark()
	return db, nil
}

// @id CODE-ENGINE-009 @implements REQ-ENGINE-009
func (db *DB) restoreHighWatermark() {
	for _, r := range db.allLocked() {
		if r.Seq > db.seq {
			db.seq = r.Seq
		}
	}
}
func (db *DB) commit(k string, v []byte, del bool) (uint64, error) {
	if db.closed {
		return 0, errors.New("database closed")
	}
	if db.seq == ^uint64(0) {
		return 0, errors.New("sequence exhausted")
	}
	r := memtable.Record{Key: k, Value: v, Seq: db.seq + 1, Deleted: del}
	if err := db.log.Append(r); err != nil {
		return 0, err
	}
	db.mem.Put(r)
	db.seq = r.Seq
	return r.Seq, nil
}
func (db *DB) Put(k string, v []byte) (uint64, error) {
	db.mu.Lock()
	defer db.mu.Unlock()
	return db.commit(k, v, false)
}
func (db *DB) Delete(k string) (uint64, error) {
	db.mu.Lock()
	defer db.mu.Unlock()
	return db.commit(k, nil, true)
}
func (db *DB) allLocked() []memtable.Record {
	rs := db.mem.All()
	for _, s := range db.tables {
		rs = append(rs, s.Records()...)
	}
	return rs
}
func (db *DB) visible(start, end string, s Snapshot) []memtable.Record {
	selected := map[string]memtable.Record{}
	for _, r := range db.allLocked() {
		if r.Seq > s.Seq || r.Key < start || (end != "" && r.Key >= end) {
			continue
		}
		prev, ok := selected[r.Key]
		if !ok || prev.Seq < r.Seq {
			selected[r.Key] = r
		}
	}
	var rows []memtable.Record
	for _, r := range selected {
		if !r.Deleted {
			rows = append(rows, memtable.Clone(r))
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Key < rows[j].Key })
	return rows
}
func (db *DB) Get(k string, s Snapshot) ([]byte, bool) {
	db.mu.Lock()
	defer db.mu.Unlock()
	best, _ := db.mem.Get(k, s.Seq)
	for _, table := range db.tables {
		r, found := table.Get(k, s.Seq)
		if found && r.Seq > best.Seq {
			best = r
		}
	}
	if best.Seq == 0 || best.Deleted {
		return nil, false
	}
	return memtable.Clone(best).Value, true
}
func (db *DB) Snapshot() Snapshot { db.mu.Lock(); defer db.mu.Unlock(); return Snapshot{Seq: db.seq} }
func (db *DB) publish(rs []memtable.Record, replace bool) error {
	if db.closed {
		return errors.New("database closed")
	}
	if len(rs) == 0 {
		return nil
	}
	next := db.manifest.Generation + 1
	name := fmt.Sprintf("table-%06d.sst", next)
	if err := sstable.Write(filepath.Join(db.dir, name), rs); err != nil {
		return err
	}
	s, err := sstable.Open(filepath.Join(db.dir, name))
	if err != nil {
		return err
	}
	files := append([]string(nil), db.manifest.Files...)
	tables := append([]*sstable.Table(nil), db.tables...)
	if replace {
		files = nil
		tables = nil
	}
	m := manifest{Files: append(files, name), Generation: next}
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	if err = sstable.Publish(filepath.Join(db.dir, "manifest.json"), b); err != nil {
		return err
	}
	db.manifest = m
	db.tables = append(tables, s)
	db.mem = memtable.New()
	return nil
}
func (db *DB) Flush() error {
	db.mu.Lock()
	defer db.mu.Unlock()
	return db.publish(db.mem.All(), false)
}
func (db *DB) Close() error {
	db.mu.Lock()
	defer db.mu.Unlock()
	if db.closed {
		return nil
	}
	db.closed = true
	return db.log.Close()
}
func (db *DB) All() []memtable.Record { db.mu.Lock(); defer db.mu.Unlock(); return db.allLocked() }
func (db *DB) Compact() error {
	db.mu.Lock()
	defer db.mu.Unlock()
	type identity struct {
		key string
		seq uint64
	}
	seen := map[identity]bool{}
	var out []memtable.Record
	for _, r := range db.allLocked() {
		id := identity{r.Key, r.Seq}
		if !seen[id] {
			seen[id] = true
			out = append(out, r)
		}
	}
	return db.publish(out, true)
}
func (db *DB) Iterate(start, end string, s Snapshot) *Iterator {
	db.mu.Lock()
	defer db.mu.Unlock()
	return &Iterator{rows: db.visible(start, end, s), at: -1}
}
func (it *Iterator) Next() bool {
	if it.at < len(it.rows) {
		it.at++
	}
	return it.at < len(it.rows)
}
func (it *Iterator) Record() memtable.Record {
	if it.at < 0 || it.at >= len(it.rows) {
		return memtable.Record{}
	}
	return memtable.Clone(it.rows[it.at])
}
