package overlay

import (
	"errors"
	"path"
	"sort"
	"strings"
	"sync"
)

type Entry struct {
	Data    []byte
	Deleted bool
}

type FS struct {
	Layers []map[string]Entry
	mu     sync.Mutex
}

// @id CODE-FS-001 @implements REQ-FS-001 REQ-FS-002 REQ-FS-003 REQ-FS-004 REQ-FS-005 REQ-FS-006 REQ-FS-007 REQ-FS-008
func New(layers ...map[string]Entry) *FS {
	f := &FS{}
	for _, layer := range layers {
		copyLayer := map[string]Entry{}
		for name, e := range layer {
			copyLayer[name] = Entry{append([]byte(nil), e.Data...), e.Deleted}
		}
		f.Layers = append(f.Layers, copyLayer)
	}
	return f
}
func valid(name string) bool {
	if !path.IsAbs(name) || strings.ContainsRune(name, 0) {
		return false
	}
	for _, part := range strings.Split(name, "/") {
		if part == ".." {
			return false
		}
	}
	return true
}
func (f *FS) Read(name string) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !valid(name) {
		return nil, errors.New("invalid path")
	}
	name = path.Clean(name)
	for i := len(f.Layers) - 1; i >= 0; i-- {
		if e, ok := f.Layers[i][name]; ok {
			if e.Deleted {
				break
			}
			return append([]byte(nil), e.Data...), nil
		}
	}
	return nil, errors.New("file not found")
}
func (f *FS) put(name string, e Entry) error {
	if !valid(name) {
		return errors.New("invalid path")
	}
	if len(f.Layers) == 0 {
		f.Layers = append(f.Layers, map[string]Entry{})
	}
	f.Layers[len(f.Layers)-1][path.Clean(name)] = e
	return nil
}
func (f *FS) Write(name string, data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.put(name, Entry{Data: append([]byte(nil), data...)})
}
func (f *FS) Remove(name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.put(name, Entry{Deleted: true})
}
func (f *FS) List() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	visible := map[string]bool{}
	for _, layer := range f.Layers {
		for name, e := range layer {
			visible[name] = !e.Deleted
		}
	}
	names := []string{}
	for name, ok := range visible {
		if ok {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}
