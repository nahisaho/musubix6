package finalizer_test

import (
	"dogfood.local/controller/finalizer"
	"dogfood.local/controller/model"
	"errors"
	"reflect"
	"testing"
)

// @id TEST-FINALIZER-001
// @verifies REQ-FINALIZER-001 REQ-FINALIZER-002 REQ-FINALIZER-003
func TestTEST_FINALIZER_001_register(t *testing.T) {
	o := model.Object{Metadata: model.Metadata{Finalizers: []string{"other"}}}
	n, changed, err := finalizer.Ensure(o, "ours", nil)
	if err != nil || !changed || !reflect.DeepEqual(n.Finalizers, []string{"other", "ours"}) {
		t.Fatal("registration")
	}
	n, changed, err = finalizer.Ensure(n, "ours", nil)
	if err != nil || changed || len(n.Finalizers) != 2 {
		t.Fatal("duplicate registration")
	}
	o.Deleting = true
	n, changed, err = finalizer.Ensure(o, "ours", nil)
	if err != nil || changed || len(n.Finalizers) != 1 {
		t.Fatal("registered on deletion")
	}
}

// @id TEST-FINALIZER-002
// @verifies REQ-FINALIZER-004 REQ-FINALIZER-005 REQ-FINALIZER-006
func TestTEST_FINALIZER_002_cleanup(t *testing.T) {
	o := model.Object{Metadata: model.Metadata{Deleting: true, Finalizers: []string{"other", "ours"}}}
	calls := 0
	wantErr := errors.New("cleanup failed")
	n, changed, err := finalizer.Ensure(o, "ours", finalizer.CleanFunc(func(model.Object) error { calls++; return wantErr }))
	if !errors.Is(err, wantErr) || changed || len(n.Finalizers) != 2 || calls != 1 {
		t.Fatal("failed cleanup lost finalizer")
	}
	n, changed, err = finalizer.Ensure(o, "ours", finalizer.CleanFunc(func(model.Object) error { calls++; return nil }))
	if err != nil || !changed || !reflect.DeepEqual(n.Finalizers, []string{"other"}) || calls != 2 {
		t.Fatal("successful cleanup")
	}
}

// @id TEST-FINALIZER-003
// @verifies REQ-FINALIZER-007 REQ-FINALIZER-008 REQ-FINALIZER-009
func TestTEST_FINALIZER_003_isolation(t *testing.T) {
	calls := 0
	clean := finalizer.CleanFunc(func(model.Object) error { calls++; return nil })
	o := model.Object{Metadata: model.Metadata{Deleting: true, Finalizers: []string{"other"}}, Labels: map[string]string{"x": "1"}}
	n, changed, err := finalizer.Ensure(o, "ours", clean)
	if err != nil || changed || calls != 0 {
		t.Fatal("unexpected cleanup")
	}
	n.Labels["x"] = "2"
	n.Finalizers[0] = "mutated"
	if o.Labels["x"] != "1" || o.Finalizers[0] != "other" {
		t.Fatal("input mutated")
	}
	if _, _, err := finalizer.Ensure(o, "", clean); err == nil || calls != 0 {
		t.Fatal("empty name accepted")
	}
}
