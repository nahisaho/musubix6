package sstable

import (
	"bytes"
	"crypto/sha256"
	"dogfood/lsm/memtable"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
)

// @id CODE-SST-001 @implements REQ-SST-001 REQ-SST-004 REQ-SST-005 REQ-SST-006 REQ-SST-007 REQ-SST-008
type Table struct {
	rows  []memtable.Record
	bloom *bloom
}
type envelope struct {
	Payload  json.RawMessage
	Checksum []byte
}

func Write(path string, rs []memtable.Record) error {
	cp := make([]memtable.Record, len(rs))
	for i, r := range rs {
		cp[i] = memtable.Clone(r)
	}
	sort.SliceStable(cp, func(i, j int) bool { return memtable.Less(cp[i], cp[j]) })
	payload, err := json.Marshal(cp)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(payload)
	b, err := json.Marshal(envelope{payload, sum[:]})
	if err != nil {
		return err
	}
	return Publish(path, b)
}
func Publish(path string, b []byte) error {
	f, err := os.OpenFile(path+".pending", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(path+".pending", path); err != nil {
		return err
	}
	d, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}
func Open(path string) (*Table, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var e envelope
	if err = json.Unmarshal(b, &e); err != nil {
		return nil, err
	}
	sum := sha256.Sum256(e.Payload)
	if !bytes.Equal(sum[:], e.Checksum) {
		return nil, errors.New("sstable checksum mismatch")
	}
	var rs []memtable.Record
	if err = json.Unmarshal(e.Payload, &rs); err != nil {
		return nil, err
	}
	s := &Table{rows: rs, bloom: newBloom(len(rs))}
	for _, r := range rs {
		s.bloom.add(r.Key)
	}
	return s, nil
}
func (s *Table) Records() []memtable.Record {
	out := make([]memtable.Record, len(s.rows))
	for i, r := range s.rows {
		out[i] = memtable.Clone(r)
	}
	return out
}
func (s *Table) MayContain(k string) bool { return s.bloom.contains(k) }
func (s *Table) Get(k string, seq uint64) (memtable.Record, bool) {
	if !s.MayContain(k) {
		return memtable.Record{}, false
	}
	i := sort.Search(len(s.rows), func(i int) bool { return s.rows[i].Key >= k })
	for ; i < len(s.rows) && s.rows[i].Key == k; i++ {
		if s.rows[i].Seq <= seq {
			return memtable.Clone(s.rows[i]), true
		}
	}
	return memtable.Record{}, false
}
