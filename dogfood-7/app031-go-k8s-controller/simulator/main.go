package main

import (
	"context"
	"dogfood.local/controller/finalizer"
	"dogfood.local/controller/internal/cache"
	"dogfood.local/controller/internal/clock"
	"dogfood.local/controller/internal/leader"
	"dogfood.local/controller/internal/queue"
	"dogfood.local/controller/model"
	controller "dogfood.local/controller/runtime"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

type Summary struct {
	Resources    int    `json:"resources"`
	Workers      int    `json:"workers"`
	Reconciles   int64  `json:"reconciles"`
	Cleanups     int64  `json:"cleanups"`
	Remaining    int    `json:"remaining"`
	FencingToken uint64 `json:"fencing_token"`
}

func simulate(resources, workers int) (Summary, error) {
	if resources < 1 || resources > 10000 || workers < 1 || workers > 64 {
		return Summary{}, errors.New("resources 1..10000 and workers 1..64 required")
	}
	cl := clock.NewFake()
	e := leader.New(cl)
	lease, _ := e.Acquire("simulator", 24*time.Hour)
	api := controller.NewMemoryAPI(e, "simulator")
	c := &controller.Controller{
		Cache: cache.Objects(), Queue: queue.New[string](cl, time.Second, 8*time.Second),
		Elector: e, Holder: "simulator", Token: lease.Token, Writer: api, Finalizer: "controller.local/cleanup",
	}
	var reconciles, cleanups atomic.Int64
	var attempts sync.Map
	c.Reconciler = controller.ReconcileFunc(func(_ context.Context, o model.Object) (string, error) {
		reconciles.Add(1)
		if _, retried := attempts.LoadOrStore(o.Key(), true); !retried {
			return "", errors.New("transient first attempt")
		}
		return "ready", nil
	})
	c.Cleaner = finalizer.CleanFunc(func(model.Object) error { cleanups.Add(1); return nil })
	api.OnEvent = func(o model.Object) { c.Observe(o) }
	api.OnDelete = func(key string, version uint64) { c.ObserveDelete(key, version) }
	for i := 0; i < resources; i++ {
		if _, err := api.Create(model.Object{Metadata: model.Metadata{Namespace: "demo", Name: fmt.Sprintf("resource-%04d", i)}}); err != nil {
			return Summary{}, err
		}
	}
	drain := func(ready bool) error {
		for round := 0; round < resources*8+20; round++ {
			var wg sync.WaitGroup
			wg.Add(workers)
			for i := 0; i < workers; i++ {
				go func() { defer wg.Done(); c.Step(context.Background()) }()
			}
			wg.Wait()
			cl.Advance(time.Second)
			items := c.Cache.List()
			done := len(items) == 0
			if ready {
				done = len(items) == resources
				for _, o := range items {
					if o.Status != "ready" {
						done = false
					}
				}
			}
			if done {
				return nil
			}
		}
		return errors.New("controller did not converge")
	}
	if err := drain(true); err != nil {
		return Summary{}, err
	}
	for _, o := range c.Cache.List() {
		if err := api.MarkDeleting(o.Key()); err != nil {
			return Summary{}, err
		}
	}
	if err := drain(false); err != nil {
		return Summary{}, err
	}
	return Summary{Resources: resources, Workers: workers, Reconciles: reconciles.Load(), Cleanups: cleanups.Load(), Remaining: len(c.Cache.List()), FencingToken: lease.Token}, nil
}

func main() {
	resources := flag.Int("resources", 12, "resources to reconcile and finalize")
	workers := flag.Int("workers", 4, "concurrent workers")
	flag.Parse()
	summary, err := simulate(*resources, *workers)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := json.NewEncoder(os.Stdout).Encode(summary); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
