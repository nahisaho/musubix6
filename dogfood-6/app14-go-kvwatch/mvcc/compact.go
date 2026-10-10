package mvcc

import (
	"encoding/binary"
	"hash/fnv"
	"sort"
)

// Compact drops history below rev: per key the newest version <= rev survives unless it is a tombstone.
// @id CODE-COMPACT-001 @implements REQ-COMPACT-001 REQ-COMPACT-002 REQ-COMPACT-003 REQ-COMPACT-009
func (s *Store) Compact(rev int64) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rev > s.rev {
		return 0, ErrFutureRev
	}
	if rev <= s.compactRev {
		return 0, ErrCompacted
	}
	removed := 0
	kept := s.keyList[:0]
	for _, k := range s.keyList {
		vs := s.index[k]
		i := sort.Search(len(vs), func(i int) bool { return vs[i].main > rev }) - 1
		drop := i
		if i >= 0 && vs[i].tomb {
			drop = i + 1
		}
		if drop < 0 {
			drop = 0
		}
		removed += drop
		vs = vs[drop:]
		if len(vs) == 0 {
			delete(s.index, k)
			continue
		}
		s.index[k] = append([]version(nil), vs...)
		kept = append(kept, k)
	}
	s.keyList = kept
	j := sort.Search(len(s.log), func(i int) bool { return s.log[i].KV.ModRev > rev })
	s.log = append([]Event(nil), s.log[j:]...)
	s.compactRev = rev
	return removed, nil
}

// @id CODE-COMPACT-002 @implements REQ-COMPACT-004
func (s *Store) CompactRev() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.compactRev
}

// HashKV hashes the live state at rev; it is invariant under compaction for rev >= CompactRev.
// @id CODE-COMPACT-003 @implements REQ-COMPACT-001
func (s *Store) HashKV(rev int64) (uint64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rev, err := s.resolve(rev)
	if err != nil {
		return 0, err
	}
	h := fnv.New64a()
	var buf [8]byte
	num := func(n int64) {
		binary.BigEndian.PutUint64(buf[:], uint64(n))
		h.Write(buf[:])
	}
	for _, k := range s.keyList {
		if kv, ok := s.at(k, rev); ok {
			num(int64(len(kv.Key)))
			h.Write([]byte(kv.Key))
			num(int64(len(kv.Value)))
			h.Write([]byte(kv.Value))
			num(kv.CreateRev)
			num(kv.ModRev)
			num(kv.Version)
			num(kv.Lease)
		}
	}
	return h.Sum64(), nil
}

func (s *Store) VersionCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := 0
	for _, vs := range s.index {
		n += len(vs)
	}
	return n
}

func (s *Store) KeyCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.index)
}
