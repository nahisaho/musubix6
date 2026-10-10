package cache

import (
	"dogfood.local/dns/wire"
	"sync"
	"testing"
	"time"
)

func answer(q wire.Question, ttl uint32) wire.Message {
	return wire.Message{Flags: 0x8400, Questions: []wire.Question{q}, Answers: []wire.RR{{Name: q.Name, Type: q.Type, Class: 1, TTL: ttl, Data: []byte{1, 2, 3, 4}}}}
}
func negative(q wire.Question) wire.Message {
	return wire.Message{Flags: 0x8403, Questions: []wire.Question{q}, Authority: []wire.RR{{Name: "example.", Type: wire.SOAType, Class: 1, TTL: 30, SOA: &wire.SOA{MName: "ns.example.", RName: "host.example.", Minimum: 10}}}}
}

// @id TEST-CACHE-001 @verifies REQ-CACHE-001 REQ-CACHE-002
func TestTEST_CACHE_001(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(4, func() time.Time { return now })
	q := wire.Question{"example.", wire.A, 1}
	m := answer(q, 20)
	m.Answers = append(m.Answers, wire.RR{Name: q.Name, Type: wire.A, Class: 1, TTL: 10, Data: []byte{5, 6, 7, 8}})
	s.Put(q, m)
	now = now.Add(3 * time.Second)
	got, ok := s.Get(q)
	if !ok || got.Answers[0].TTL != 17 || got.Answers[1].TTL != 7 {
		t.Fatalf("aged cache %#v %v", got, ok)
	}
	now = now.Add(7 * time.Second)
	if _, ok := s.Get(q); ok {
		t.Fatal("expiry boundary accepted")
	}
}

// @id TEST-CACHE-002 @verifies REQ-CACHE-003 REQ-CACHE-004
func TestTEST_CACHE_002(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(4, func() time.Time { return now })
	q := wire.Question{"absent.example.", wire.A, 1}
	s.Put(q, negative(q))
	if got, ok := s.Get(q); !ok || got.Flags&15 != 3 {
		t.Fatal("negative not cached")
	}
	now = now.Add(10 * time.Second)
	if _, ok := s.Get(q); ok {
		t.Fatal("negative outlived minimum")
	}
	m := negative(q)
	m.Authority = nil
	s.Put(q, m)
	if _, ok := s.Get(q); ok {
		t.Fatal("no SOA cached")
	}
}

// @id TEST-CACHE-003 @verifies REQ-CACHE-005 REQ-CACHE-006
func TestTEST_CACHE_003(t *testing.T) {
	s := New(4, time.Now)
	q := wire.Question{"EXAMPLE", wire.A, 1}
	m := answer(q, 30)
	s.Put(q, m)
	m.Answers[0].Data[0] = 99
	q.Name = "example."
	got, ok := s.Get(q)
	if !ok || got.Answers[0].Data[0] != 1 {
		t.Fatal("key or input copy")
	}
	got.Answers[0].Data[0] = 88
	again, _ := s.Get(q)
	if again.Answers[0].Data[0] != 1 {
		t.Fatal("output aliased")
	}
	q.Type = wire.AAAA
	if _, ok := s.Get(q); ok {
		t.Fatal("types collided")
	}
}

// @id TEST-CACHE-004 @verifies REQ-CACHE-007 REQ-CACHE-008
func TestTEST_CACHE_004(t *testing.T) {
	s := New(2, time.Now)
	a := wire.Question{"a.", wire.A, 1}
	b := wire.Question{"b.", wire.A, 1}
	c := wire.Question{"c.", wire.A, 1}
	s.Put(a, answer(a, 60))
	s.Put(b, answer(b, 60))
	s.Get(a)
	s.Put(c, answer(c, 60))
	if _, ok := s.Get(b); ok {
		t.Fatal("LRU did not evict b")
	}
	if _, ok := s.Get(a); !ok {
		t.Fatal("MRU lost")
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				s.Put(a, answer(a, 60))
				s.Get(a)
			}
		}()
	}
	wg.Wait()
	if _, ok := s.Get(a); !ok {
		t.Fatal("concurrent cache lost value")
	}
}
