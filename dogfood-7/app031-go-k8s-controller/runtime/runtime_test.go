package runtime_test

import (
	"context"
	"dogfood.local/controller/finalizer"
	"dogfood.local/controller/internal/cache"
	"dogfood.local/controller/internal/clock"
	"dogfood.local/controller/internal/leader"
	"dogfood.local/controller/internal/queue"
	"dogfood.local/controller/model"
	controller "dogfood.local/controller/runtime"
	"errors"
	"sync"
	"testing"
	"time"
)

func setup() (*controller.Controller, *clock.Fake) {
	cl := clock.NewFake()
	el := leader.New(cl)
	lease, _ := el.Acquire("worker", time.Hour)
	c := &controller.Controller{
		Cache: cache.Objects(), Queue: queue.New[string](cl, time.Second, 8*time.Second),
		Elector: el, Holder: "worker", Token: lease.Token,
		Reconciler: controller.ReconcileFunc(func(context.Context, model.Object) (string, error) { return "ready", nil }),
		Writer:     controller.WriteFunc(func(model.Object, uint64, uint64) error { return nil }),
	}
	return c, cl
}
func object(name string, v uint64) model.Object {
	return model.Object{Metadata: model.Metadata{Namespace: "ns", Name: name, Version: v}}
}

// @id TEST-RUNTIME-001
// @verifies REQ-RUNTIME-001 REQ-RUNTIME-002 REQ-RUNTIME-003
func TestTEST_RUNTIME_001_observe(t *testing.T) {
	c, _ := setup()
	var written model.Object
	var expected uint64
	c.Writer = controller.WriteFunc(func(o model.Object, rv, token uint64) error {
		if token != c.Token {
			t.Error("missing fencing token")
		}
		written = o
		expected = rv
		return nil
	})
	c.Observe(object("a", 1))
	c.Observe(object("a", 2))
	ok, err := c.Step(context.Background())
	if !ok || err != nil || written.Key() != "ns/a" || written.Status != "ready" || expected != 2 {
		t.Fatal("not reconciled from latest cache")
	}
	if ok, err := c.Step(context.Background()); ok || err != nil {
		t.Fatal("key not deduplicated")
	}
}

// @id TEST-RUNTIME-002
// @verifies REQ-RUNTIME-004 REQ-RUNTIME-005 REQ-RUNTIME-006
func TestTEST_RUNTIME_002_retry(t *testing.T) {
	c, cl := setup()
	calls := 0
	wantErr := errors.New("temporary")
	c.Reconciler = controller.ReconcileFunc(func(context.Context, model.Object) (string, error) {
		calls++
		if calls == 1 {
			return "", wantErr
		}
		return "ready", nil
	})
	c.Observe(object("a", 1))
	if ok, err := c.Step(context.Background()); !ok || !errors.Is(err, wantErr) {
		t.Fatal("error not returned")
	}
	if c.Queue.NumRequeues("ns/a") != 1 {
		t.Fatal("retry not recorded")
	}
	if ok, _ := c.Step(context.Background()); ok {
		t.Fatal("early retry")
	}
	cl.Advance(time.Second)
	if ok, err := c.Step(context.Background()); !ok || err != nil {
		t.Fatal("retry failed")
	}
	if c.Queue.NumRequeues("ns/a") != 0 {
		t.Fatal("retry count retained")
	}
	c.Queue.Add("ns/missing")
	if ok, err := c.Step(context.Background()); !ok || err != nil || calls != 2 {
		t.Fatal("missing cache key reconciled")
	}
}

// @id TEST-RUNTIME-005
// @verifies REQ-RUNTIME-012
func TestTEST_RUNTIME_005_noop_status(t *testing.T) {
	c, _ := setup()
	writes := 0
	c.Writer = controller.WriteFunc(func(model.Object, uint64, uint64) error { writes++; return nil })
	o := object("unchanged", 1)
	o.Status = "ready"
	c.Observe(o)
	if ok, err := c.Step(context.Background()); !ok || err != nil || writes != 0 {
		t.Fatal("unchanged status triggered write")
	}
}

// @id TEST-RUNTIME-003
// @verifies REQ-RUNTIME-007 REQ-RUNTIME-008 REQ-RUNTIME-009
func TestTEST_RUNTIME_003_lifecycle_concurrency(t *testing.T) {
	c, cl := setup()
	c.Observe(object("a", 1))
	cl.Advance(time.Hour)
	if ok, _ := c.Step(context.Background()); ok {
		t.Fatal("expired leader processed work")
	}
	lease, _ := c.Elector.Acquire("worker", time.Hour)
	c.Token = lease.Token
	c.Finalizer = "ours"
	cleaned := 0
	c.Cleaner = finalizer.CleanFunc(func(model.Object) error { cleaned++; return nil })
	deleting := object("a", 2)
	deleting.Deleting = true
	deleting.Finalizers = []string{"ours", "other"}
	c.Observe(deleting)
	c.Writer = controller.WriteFunc(func(o model.Object, rv, token uint64) error {
		if rv != 2 || len(o.Finalizers) != 1 || o.Finalizers[0] != "other" || cleaned != 1 {
			t.Error("cleanup/write ordering")
		}
		return nil
	})
	if ok, err := c.Step(context.Background()); !ok || err != nil {
		t.Fatal("cleanup step")
	}
	c.Finalizer = ""
	entered := make(chan string, 2)
	release := make(chan struct{})
	c.Reconciler = controller.ReconcileFunc(func(_ context.Context, o model.Object) (string, error) {
		entered <- o.Key()
		<-release
		return "ready", nil
	})
	c.Writer = controller.WriteFunc(func(model.Object, uint64, uint64) error { return nil })
	c.Observe(object("b", 1))
	c.Observe(object("c", 1))
	var wg sync.WaitGroup
	wg.Add(2)
	for i := 0; i < 2; i++ {
		go func() {
			defer wg.Done()
			if _, err := c.Step(context.Background()); err != nil {
				t.Error(err)
			}
		}()
	}
	keys := map[string]bool{}
	for i := 0; i < 2; i++ {
		select {
		case key := <-entered:
			keys[key] = true
		case <-time.After(time.Second):
			close(release)
			wg.Wait()
			t.Fatal("workers serialized")
		}
	}
	close(release)
	wg.Wait()
	if len(keys) != 2 {
		t.Fatal("same key in two workers")
	}
	writes := 0
	c.Writer = controller.WriteFunc(func(model.Object, uint64, uint64) error { writes++; return nil })
	c.Reconciler = controller.ReconcileFunc(func(context.Context, model.Object) (string, error) {
		cl.Advance(time.Hour)
		return "stale", nil
	})
	c.Observe(object("late", 1))
	if ok, err := c.Step(context.Background()); !ok || err == nil || writes != 0 {
		t.Fatal("leadership lost during callback was not fenced")
	}
}
