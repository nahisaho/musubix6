package runtime

import (
	"dogfood.local/controller/internal/leader"
	"dogfood.local/controller/model"
	"errors"
	"sync"
)

var ErrConflict = errors.New("resource version conflict")

type MemoryAPI struct {
	mu       sync.Mutex
	Elector  *leader.Elector
	Holder   string
	OnEvent  func(model.Object)
	OnDelete func(string, uint64)
	objects  map[string]model.Object
	version  uint64
}

func NewMemoryAPI(elector *leader.Elector, holder string) *MemoryAPI {
	return &MemoryAPI{Elector: elector, Holder: holder, objects: make(map[string]model.Object)}
}

// @id CODE-RUNTIME-002
// @implements REQ-RUNTIME-010 REQ-RUNTIME-011
func (a *MemoryAPI) Create(o model.Object) (model.Object, error) {
	a.mu.Lock()
	if o.Name == "" {
		a.mu.Unlock()
		return model.Object{}, errors.New("name required")
	}
	if _, exists := a.objects[o.Key()]; exists {
		a.mu.Unlock()
		return model.Object{}, ErrConflict
	}
	a.version++
	n := o.Clone()
	n.Version = a.version
	a.objects[n.Key()] = n.Clone()
	a.mu.Unlock()
	a.emit(n, false)
	return n, nil
}

func (a *MemoryAPI) Read(key string) (model.Object, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	o, ok := a.objects[key]
	return o.Clone(), ok
}

func (a *MemoryAPI) Write(o model.Object, expected, token uint64) error {
	var event model.Object
	deleted := false
	err := a.Elector.WithFence(a.Holder, token, func() error {
		a.mu.Lock()
		defer a.mu.Unlock()
		old, ok := a.objects[o.Key()]
		if !ok || old.Version != expected {
			return ErrConflict
		}
		a.version++
		event = o.Clone()
		event.Version = a.version
		deleted = event.Deleting && len(event.Finalizers) == 0
		if deleted {
			delete(a.objects, event.Key())
		} else {
			a.objects[event.Key()] = event.Clone()
		}
		return nil
	})
	if err == nil {
		a.emit(event, deleted)
	}
	return err
}

func (a *MemoryAPI) MarkDeleting(key string) error {
	a.mu.Lock()
	o, exists := a.objects[key]
	if !exists {
		a.mu.Unlock()
		return ErrConflict
	}
	a.version++
	o = o.Clone()
	o.Deleting = true
	o.Version = a.version
	deleted := len(o.Finalizers) == 0
	if deleted {
		delete(a.objects, key)
	} else {
		a.objects[key] = o.Clone()
	}
	a.mu.Unlock()
	a.emit(o, deleted)
	return nil
}

func (a *MemoryAPI) emit(o model.Object, deleted bool) {
	if deleted {
		if a.OnDelete != nil {
			a.OnDelete(o.Key(), o.Version)
		}
	} else if a.OnEvent != nil {
		a.OnEvent(o.Clone())
	}
}
