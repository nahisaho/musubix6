package main

import (
	"dogfood.local/controller/internal/clock"
	"dogfood.local/controller/internal/leader"
	"dogfood.local/controller/model"
	controller "dogfood.local/controller/runtime"
	"errors"
	"testing"
	"time"
)

// @id TEST-RUNTIME-004
// @verifies REQ-RUNTIME-010 REQ-RUNTIME-011
func TestTEST_RUNTIME_004_transactions(t *testing.T) {
	cl := clock.NewFake()
	e := leader.New(cl)
	lease, _ := e.Acquire("worker", time.Second)
	api := controller.NewMemoryAPI(e, "worker")
	events := 0
	api.OnEvent = func(o model.Object) {
		events++
		api.Read(o.Key())
		e.Snapshot()
		if o.Labels != nil {
			o.Labels["x"] = "watch mutation"
		}
	}
	o, err := api.Create(model.Object{Metadata: model.Metadata{Namespace: "ns", Name: "a"}, Labels: map[string]string{"x": "original"}})
	if err != nil || o.Version == 0 {
		t.Fatal("create failed")
	}
	o.Status = "ready"
	if err := api.Write(o, o.Version, lease.Token); err != nil {
		t.Fatal(err)
	}
	stored, _ := api.Read(o.Key())
	if stored.Version <= o.Version || stored.Status != "ready" || stored.Labels["x"] != "original" {
		t.Fatal("bad commit or watcher isolation")
	}
	second, err := api.Create(model.Object{Metadata: model.Metadata{Namespace: "ns", Name: "b"}})
	if err != nil || second.Version <= stored.Version {
		t.Fatal("not a global resource version")
	}
	stored.Status = "updated"
	if err := api.Write(stored, stored.Version, lease.Token); err != nil {
		t.Fatal(err)
	}
	stored, _ = api.Read(o.Key())
	if stored.Version <= second.Version {
		t.Fatal("cross-object commit version did not advance")
	}
	if err := api.Write(o, o.Version, lease.Token); !errors.Is(err, controller.ErrConflict) {
		t.Fatal("stale version accepted")
	}
	cl.Advance(time.Second)
	newLease, _ := e.Acquire("worker", time.Second)
	stored.Status = "stale"
	if err := api.Write(stored, stored.Version, lease.Token); !errors.Is(err, leader.ErrLeadership) {
		t.Fatal("stale fencing token accepted")
	}
	if err := api.Write(stored, stored.Version, newLease.Token); err != nil {
		t.Fatal("valid new token rejected")
	}
	if events != 5 {
		t.Fatalf("events %d want 5", events)
	}
}
