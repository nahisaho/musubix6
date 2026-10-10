package mvcc

import (
	"errors"
	"sort"
	"sync"
)

var (
	ErrEmptyKey  = errors.New("mvcc: empty key")
	ErrFutureRev = errors.New("mvcc: required revision is a future revision")
	ErrCompacted = errors.New("mvcc: required revision has been compacted")
)

type KeyValue struct {
	Key       string
	Value     string
	CreateRev int64
	ModRev    int64
	Version   int64
	Lease     int64
}

type EventType int

const (
	EventPut EventType = iota
	EventDelete
)

type Event struct {
	Type   EventType
	KV     KeyValue
	PrevKV *KeyValue
}

type OpKind int

const (
	OpPut OpKind = iota
	OpDelete
)

// Op is a write; for OpDelete a non-empty End makes it a range delete.
type Op struct {
	Kind  OpKind
	Key   string
	End   string
	Value string
	Lease int64
}

type Result struct {
	Rev     int64
	Events  []Event
	Deleted int
}

type Reader interface {
	Rev() int64
	Get(key string) (KeyValue, bool)
	Range(start, end string) []KeyValue
}

type version struct {
	main   int64
	sub    int
	create int64
	ver    int64
	value  string
	lease  int64
	tomb   bool
}

func (v version) kv(key string) KeyValue {
	return KeyValue{Key: key, Value: v.value, CreateRev: v.create, ModRev: v.main, Version: v.ver, Lease: v.lease}
}

// Store is an in-memory MVCC key-value store. Subscribers must not write back into the store.
type Store struct {
	mu         sync.RWMutex
	notifyMu   sync.Mutex
	rev        int64
	compactRev int64
	index      map[string][]version
	keyList    []string
	log        []Event
	subs       []func([]Event)
}

func New() *Store { return &Store{index: map[string][]version{}} }

// @id CODE-STORE-001 @implements REQ-STORE-015
func (s *Store) Rev() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.rev
}

func (s *Store) Put(key, value string, lease int64) (KeyValue, error) {
	res, err := s.ApplyOps([]Op{{Kind: OpPut, Key: key, Value: value, Lease: lease}})
	if err != nil {
		return KeyValue{}, err
	}
	return res.Events[0].KV, nil
}

func (s *Store) Delete(key string) (bool, error) {
	res, err := s.ApplyOps([]Op{{Kind: OpDelete, Key: key}})
	return res.Deleted > 0, err
}

func (s *Store) DeleteRange(start, end string) (int, error) {
	if end == "" {
		end = start + "\x00"
	}
	res, err := s.ApplyOps([]Op{{Kind: OpDelete, Key: start, End: end}})
	return res.Deleted, err
}

// @id CODE-STORE-002 @implements REQ-STORE-003 REQ-STORE-004
func (s *Store) Get(key string, rev int64) (KeyValue, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rev, err := s.resolve(rev)
	if err != nil {
		return KeyValue{}, false, err
	}
	kv, ok := s.at(key, rev)
	return kv, ok, nil
}

func (s *Store) resolve(rev int64) (int64, error) {
	if rev == 0 {
		return s.rev, nil
	}
	if rev > s.rev {
		return 0, ErrFutureRev
	}
	if rev < s.compactRev {
		return 0, ErrCompacted
	}
	return rev, nil
}

func (s *Store) at(key string, rev int64) (KeyValue, bool) {
	vs := s.index[key]
	i := sort.Search(len(vs), func(i int) bool { return vs[i].main > rev })
	if i == 0 || vs[i-1].tomb {
		return KeyValue{}, false
	}
	return vs[i-1].kv(key), true
}

func (s *Store) latest(key string) (KeyValue, bool) {
	vs := s.index[key]
	if len(vs) == 0 || vs[len(vs)-1].tomb {
		return KeyValue{}, false
	}
	return vs[len(vs)-1].kv(key), true
}

// matching returns the keys of [start,end): end "" is exactly start, "\x00" is unbounded.
func (s *Store) matching(start, end string) []string {
	if end == "" {
		if _, ok := s.index[start]; ok {
			return []string{start}
		}
		return nil
	}
	lo := sort.SearchStrings(s.keyList, start)
	hi := len(s.keyList)
	if end != "\x00" {
		hi = sort.SearchStrings(s.keyList, end)
	}
	if hi <= lo {
		return nil
	}
	return s.keyList[lo:hi]
}

// @id CODE-STORE-003 @implements REQ-STORE-007 REQ-STORE-008 REQ-STORE-009
func (s *Store) Range(start, end string, rev int64, limit int) ([]KeyValue, int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rev, err := s.resolve(rev)
	if err != nil {
		return nil, 0, err
	}
	out := []KeyValue{}
	total := 0
	for _, k := range s.matching(start, end) {
		if kv, ok := s.at(k, rev); ok {
			total++
			if limit <= 0 || len(out) < limit {
				out = append(out, kv)
			}
		}
	}
	return out, total, nil
}

type reader struct{ s *Store }

func (r reader) Rev() int64                      { return r.s.rev }
func (r reader) Get(key string) (KeyValue, bool) { return r.s.latest(key) }
func (r reader) Range(start, end string) []KeyValue {
	out := []KeyValue{}
	for _, k := range r.s.matching(start, end) {
		if kv, ok := r.s.latest(k); ok {
			out = append(out, kv)
		}
	}
	return out
}

func (s *Store) ApplyOps(ops []Op) (Result, error) {
	return s.Apply(func(Reader) []Op { return ops })
}

// @id CODE-STORE-004 @implements REQ-STORE-016 REQ-STORE-001 REQ-STORE-002 REQ-STORE-005 REQ-STORE-006 REQ-STORE-010 REQ-STORE-011 REQ-STORE-012
func (s *Store) Apply(decide func(Reader) []Op) (Result, error) {
	s.notifyMu.Lock()
	defer s.notifyMu.Unlock()
	res, subs, err := s.commit(decide)
	if err != nil {
		return res, err
	}
	if len(res.Events) > 0 {
		for _, fn := range subs {
			fn(append([]Event(nil), res.Events...))
		}
	}
	return res, nil
}

// commit holds the write lock (released even if decide panics) while it validates and applies the batch.
func (s *Store) commit(decide func(Reader) []Op) (Result, []func([]Event), error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ops := decide(reader{s})
	for _, op := range ops {
		if op.Key == "" {
			return Result{Rev: s.rev}, nil, ErrEmptyKey
		}
	}
	next := s.rev + 1
	var events []Event
	deleted := 0
	for _, op := range ops {
		switch op.Kind {
		case OpPut:
			events = append(events, s.put(op, next, len(events)))
		case OpDelete:
			for _, k := range s.deleteTargets(op) {
				prev, ok := s.latest(k)
				if !ok {
					continue
				}
				s.index[k] = append(s.index[k], version{main: next, sub: len(events), tomb: true})
				events = append(events, Event{Type: EventDelete, KV: KeyValue{Key: k, ModRev: next}, PrevKV: &prev})
				deleted++
			}
		}
	}
	if len(events) > 0 {
		s.rev = next
		s.log = append(s.log, events...)
	}
	return Result{Rev: s.rev, Events: events, Deleted: deleted}, s.subs, nil
}

// deleteTargets copies the matching keys because deletions mutate the index while iterating.
func (s *Store) deleteTargets(op Op) []string {
	if op.End == "" {
		return []string{op.Key}
	}
	return append([]string(nil), s.matching(op.Key, op.End)...)
}

func (s *Store) put(op Op, rev int64, sub int) Event {
	prev, had := s.latest(op.Key)
	v := version{main: rev, sub: sub, create: rev, ver: 1, value: op.Value, lease: op.Lease}
	var ev Event
	if had {
		v.create, v.ver = prev.CreateRev, prev.Version+1
		ev.PrevKV = &prev
	}
	if _, known := s.index[op.Key]; !known {
		i := sort.SearchStrings(s.keyList, op.Key)
		s.keyList = append(s.keyList, "")
		copy(s.keyList[i+1:], s.keyList[i:])
		s.keyList[i] = op.Key
	}
	s.index[op.Key] = append(s.index[op.Key], v)
	ev.Type, ev.KV = EventPut, v.kv(op.Key)
	return ev
}

// @id CODE-STORE-005 @implements REQ-STORE-013 REQ-COMPACT-005
func (s *Store) EventsSince(rev int64) ([]Event, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if rev < 1 {
		rev = 1
	}
	if rev <= s.compactRev {
		return nil, ErrCompacted
	}
	i := sort.Search(len(s.log), func(i int) bool { return s.log[i].KV.ModRev >= rev })
	return append([]Event(nil), s.log[i:]...), nil
}

// @id CODE-STORE-006 @implements REQ-STORE-014
func (s *Store) Subscribe(fn func([]Event)) {
	s.notifyMu.Lock()
	defer s.notifyMu.Unlock()
	s.subs = append(s.subs, fn)
}
