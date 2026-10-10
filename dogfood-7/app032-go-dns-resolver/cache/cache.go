package cache

import (
	"container/list"
	"dogfood.local/dns/internal/name"
	"dogfood.local/dns/wire"
	"sync"
	"time"
)

type entry struct {
	q                 wire.Question
	m                 wire.Message
	inserted, expires time.Time
}
type Store struct {
	mu       sync.Mutex
	capacity int
	clock    func() time.Time
	items    map[wire.Question]*list.Element
	lru      *list.List
}

func New(capacity int, clock func() time.Time) *Store {
	if capacity < 1 {
		capacity = 1
	}
	if clock == nil {
		clock = time.Now
	}
	return &Store{capacity: capacity, clock: clock, items: map[wire.Question]*list.Element{}, lru: list.New()}
}
func key(q wire.Question) (wire.Question, bool) {
	n, err := name.Canonical(q.Name)
	q.Name = n
	return q, err == nil
}
func copySlice[T any](values []T) []T { return append([]T(nil), values...) }
func copyRR(rr []wire.RR) []wire.RR {
	if rr == nil {
		return nil
	}
	out := copySlice(rr)
	for i := range out {
		out[i].Data = copySlice(out[i].Data)
		if out[i].SOA != nil {
			s := *out[i].SOA
			out[i].SOA = &s
		}
	}
	return out
}
func clone(m wire.Message) wire.Message {
	m.Questions = copySlice(m.Questions)
	m.Answers = copyRR(m.Answers)
	m.Authority = copyRR(m.Authority)
	m.Additional = copyRR(m.Additional)
	return m
}

// @id CODE-CACHE-001 @implements REQ-CACHE-001 REQ-CACHE-002 REQ-CACHE-003 REQ-CACHE-004 REQ-CACHE-005 REQ-CACHE-006 REQ-CACHE-007 REQ-CACHE-008
func (s *Store) Put(q wire.Question, m wire.Message) {
	q, ok := key(q)
	if !ok {
		return
	}
	ttl := uint32(^uint32(0))
	code := m.Flags & 15
	if code != 0 && code != 3 {
		return
	}
	if len(m.Answers) > 0 && code == 0 {
		for _, r := range m.Answers {
			if r.TTL < ttl {
				ttl = r.TTL
			}
		}
	} else {
		ttl = 0
		for _, r := range m.Authority {
			if r.Type == wire.SOAType && r.SOA != nil {
				ttl = r.TTL
				if r.SOA.Minimum < ttl {
					ttl = r.SOA.Minimum
				}
				break
			}
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if prev := s.items[q]; prev != nil {
		s.lru.Remove(prev)
		delete(s.items, q)
	}
	if ttl == 0 {
		return
	}
	now := s.clock()
	e := entry{q, clone(m), now, now.Add(time.Duration(ttl) * time.Second)}
	s.items[q] = s.lru.PushFront(e)
	if s.lru.Len() > s.capacity {
		last := s.lru.Back()
		delete(s.items, last.Value.(entry).q)
		s.lru.Remove(last)
	}
}
func (s *Store) Get(q wire.Question) (wire.Message, bool) {
	q, ok := key(q)
	if !ok {
		return wire.Message{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	el := s.items[q]
	if el == nil {
		return wire.Message{}, false
	}
	e := el.Value.(entry)
	now := s.clock()
	if !now.Before(e.expires) {
		delete(s.items, q)
		s.lru.Remove(el)
		return wire.Message{}, false
	}
	s.lru.MoveToFront(el)
	m := clone(e.m)
	elapsed := now.Sub(e.inserted) / time.Second
	if elapsed < 0 {
		elapsed = 0
	}
	for _, section := range [][]wire.RR{m.Answers, m.Authority, m.Additional} {
		for i := range section {
			if uint64(elapsed) >= uint64(section[i].TTL) {
				section[i].TTL = 0
			} else {
				section[i].TTL -= uint32(elapsed)
			}
		}
	}
	return m, true
}
