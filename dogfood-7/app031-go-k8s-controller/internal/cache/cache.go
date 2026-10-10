package cache

import (
	"dogfood.local/controller/model"
	"sort"
	"sync"
)

type Store[T any] struct {
	mu              sync.RWMutex
	key             func(T) string
	version         func(T) uint64
	clone           func(T) T
	objects         map[string]T
	tombstones      map[string]uint64
	watermark       uint64
	snapshotVersion uint64
	hasSnapshot     bool
	watchers        []func(string, T)
}

func New[T any](key func(T) string, version func(T) uint64, clone func(T) T) *Store[T] {
	return &Store[T]{key: key, version: version, clone: clone, objects: make(map[string]T), tombstones: make(map[string]uint64)}
}
func Objects() *Store[model.Object] {
	return New(model.Object.Key, func(o model.Object) uint64 { return o.Version }, model.Object.Clone)
}

// @id CODE-CACHE-001
// @implements REQ-CACHE-001 REQ-CACHE-002 REQ-CACHE-003 REQ-CACHE-004 REQ-CACHE-005 REQ-CACHE-006 REQ-CACHE-007 REQ-CACHE-008 REQ-CACHE-009 REQ-CACHE-011
func (s *Store[T]) Upsert(v T) bool {
	key, rv := s.key(v), s.version(v)
	s.mu.Lock()
	if s.hasSnapshot && rv <= s.snapshotVersion {
		s.mu.Unlock()
		return false
	}
	if dead, ok := s.tombstones[key]; ok && rv <= dead {
		s.mu.Unlock()
		return false
	}
	if old, ok := s.objects[key]; ok && rv <= s.version(old) {
		s.mu.Unlock()
		return false
	}
	s.objects[key] = s.clone(v)
	if rv > s.watermark {
		s.watermark = rv
	}
	watchers := append([]func(string, T){}, s.watchers...)
	event := s.clone(v)
	s.mu.Unlock()
	s.notify(watchers, key, event)
	return true
}

// @id CODE-CACHE-002
// @implements REQ-CACHE-010 REQ-CACHE-011
func (s *Store[T]) Delete(key string, version uint64) bool {
	s.mu.Lock()
	if s.hasSnapshot && version <= s.snapshotVersion {
		s.mu.Unlock()
		return false
	}
	old, ok := s.objects[key]
	if ok && version < s.version(old) {
		s.mu.Unlock()
		return false
	}
	if dead, exists := s.tombstones[key]; exists && version <= dead {
		s.mu.Unlock()
		return false
	}
	delete(s.objects, key)
	s.tombstones[key] = version
	if version > s.watermark {
		s.watermark = version
	}
	watchers := append([]func(string, T){}, s.watchers...)
	var event T
	if ok {
		event = s.clone(old)
	}
	s.mu.Unlock()
	if ok {
		s.notify(watchers, key, event)
	}
	return true
}

func (s *Store[T]) Get(key string) (T, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.objects[key]
	if !ok {
		var zero T
		return zero, false
	}
	return s.clone(v), true
}

func (s *Store[T]) List() []T {
	s.mu.RLock()
	defer s.mu.RUnlock()
	keys := make([]string, 0, len(s.objects))
	for key := range s.objects {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	values := make([]T, 0, len(keys))
	for _, key := range keys {
		values = append(values, s.clone(s.objects[key]))
	}
	return values
}

func (s *Store[T]) Replace(values []T, rv uint64) bool {
	s.mu.Lock()
	if rv < s.watermark {
		s.mu.Unlock()
		return false
	}
	next := make(map[string]T, len(values))
	for _, v := range values {
		if s.version(v) > rv {
			s.mu.Unlock()
			return false
		}
		next[s.key(v)] = s.clone(v)
	}
	events := make(map[string]T, len(next))
	for key, v := range next {
		events[key] = s.clone(v)
	}
	for key, old := range s.objects {
		if _, exists := next[key]; !exists {
			s.tombstones[key] = rv
			events[key] = s.clone(old)
		}
	}
	s.objects = next
	s.watermark = rv
	s.snapshotVersion = rv
	s.hasSnapshot = true
	watchers := append([]func(string, T){}, s.watchers...)
	s.mu.Unlock()
	keys := make([]string, 0, len(events))
	for key := range events {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		s.notify(watchers, key, events[key])
	}
	return true
}

func (s *Store[T]) Watch(fn func(string, T)) {
	if fn == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.watchers = append(s.watchers, fn)
}

func (s *Store[T]) notify(watchers []func(string, T), key string, value T) {
	for _, fn := range watchers {
		fn(key, s.clone(value))
	}
}
