package runtime

import (
	"context"
	"dogfood.local/controller/finalizer"
	"dogfood.local/controller/internal/cache"
	"dogfood.local/controller/internal/leader"
	"dogfood.local/controller/internal/queue"
	"dogfood.local/controller/model"
	"errors"
)

type Reconciler interface {
	Reconcile(context.Context, model.Object) (string, error)
}
type ReconcileFunc func(context.Context, model.Object) (string, error)

func (f ReconcileFunc) Reconcile(c context.Context, o model.Object) (string, error) { return f(c, o) }

type Writer interface {
	Write(model.Object, uint64, uint64) error
}
type WriteFunc func(model.Object, uint64, uint64) error

func (f WriteFunc) Write(o model.Object, v, token uint64) error { return f(o, v, token) }

type Controller struct {
	Cache      *cache.Store[model.Object]
	Queue      *queue.Queue[string]
	Elector    *leader.Elector
	Holder     string
	Token      uint64
	Reconciler Reconciler
	Writer     Writer
	Finalizer  string
	Cleaner    finalizer.Cleaner
}

// @id CODE-RUNTIME-001
// @implements REQ-RUNTIME-001 REQ-RUNTIME-002 REQ-RUNTIME-003 REQ-RUNTIME-004 REQ-RUNTIME-005 REQ-RUNTIME-006 REQ-RUNTIME-007 REQ-RUNTIME-008 REQ-RUNTIME-009 REQ-RUNTIME-012
func (c *Controller) Observe(o model.Object) bool {
	if !c.Cache.Upsert(o) {
		return false
	}
	c.Queue.Add(o.Key())
	return true
}

func (c *Controller) ObserveDelete(key string, version uint64) bool {
	if !c.Cache.Delete(key, version) {
		return false
	}
	c.Queue.Add(key)
	return true
}
func (c *Controller) Step(ctx context.Context) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if !c.Elector.Active(c.Holder, c.Token) {
		return false, nil
	}
	c.Queue.Tick()
	key, ok := c.Queue.Get()
	if !ok {
		return false, nil
	}
	defer c.Queue.Done(key)
	o, exists := c.Cache.Get(key)
	if !exists {
		c.Queue.Forget(key)
		return true, nil
	}
	err := c.reconcile(ctx, o)
	if err != nil {
		c.Queue.AddRateLimited(key)
	} else {
		c.Queue.Forget(key)
	}
	return true, err
}

func (c *Controller) reconcile(ctx context.Context, o model.Object) error {
	if !c.Elector.Active(c.Holder, c.Token) {
		return errors.New("leadership lost")
	}
	next := o.Clone()
	changed := false
	if c.Finalizer != "" {
		var err error
		next, changed, err = finalizer.Ensure(o, c.Finalizer, c.Cleaner)
		if err != nil {
			return err
		}
	}
	if !changed && !o.Deleting {
		if c.Reconciler == nil {
			return errors.New("reconciler required")
		}
		status, err := c.Reconciler.Reconcile(ctx, o.Clone())
		if err != nil {
			return err
		}
		if status == o.Status {
			return nil
		}
		next.Status = status
		changed = true
	}
	if !changed {
		return nil
	}
	if !c.Elector.Active(c.Holder, c.Token) {
		return errors.New("leadership lost")
	}
	if c.Writer == nil {
		return errors.New("writer required")
	}
	return c.Writer.Write(next, o.Version, c.Token)
}
