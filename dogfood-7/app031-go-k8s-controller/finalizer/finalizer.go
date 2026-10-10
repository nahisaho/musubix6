package finalizer

import (
	"dogfood.local/controller/model"
	"errors"
	"slices"
)

type Cleaner interface{ Cleanup(model.Object) error }
type CleanFunc func(model.Object) error

func (f CleanFunc) Cleanup(o model.Object) error { return f(o) }

// @id CODE-FINALIZER-001
// @implements REQ-FINALIZER-001 REQ-FINALIZER-002 REQ-FINALIZER-003 REQ-FINALIZER-004 REQ-FINALIZER-005 REQ-FINALIZER-006 REQ-FINALIZER-007 REQ-FINALIZER-008 REQ-FINALIZER-009
func Ensure(o model.Object, name string, cleaner Cleaner) (model.Object, bool, error) {
	n := o.Clone()
	if name == "" {
		return n, false, errors.New("empty finalizer name")
	}
	owned := slices.Contains(n.Finalizers, name)
	if !n.Deleting {
		if owned {
			return n, false, nil
		}
		n.Finalizers = append(n.Finalizers, name)
		return n, true, nil
	}
	if !owned {
		return n, false, nil
	}
	if cleaner == nil {
		return n, false, errors.New("cleanup required")
	}
	if err := cleaner.Cleanup(n.Clone()); err != nil {
		return n, false, err
	}
	n.Finalizers = slices.DeleteFunc(n.Finalizers, func(f string) bool { return f == name })
	return n, true, nil
}
