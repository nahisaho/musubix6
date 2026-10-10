package control

import (
	mesh "dogfood.mesh"
	"testing"
)

func snapshot(v uint64) mesh.Snapshot {
	return mesh.Snapshot{Version: v, Endpoints: []mesh.Endpoint{{ID: "a", Address: "a:80", Weight: 1, Healthy: true}}}
}

// @id TEST-XDS-001 @verifies REQ-XDS-001 REQ-XDS-002
func TestTEST_XDS_001(t *testing.T) {
	c := New()
	ch, cancel := c.Subscribe("p")
	defer cancel()
	if err := c.Publish(snapshot(1)); err != nil {
		t.Fatal(err)
	}
	d := <-ch
	if d.Snapshot.Version != 1 || d.Nonce == "" {
		t.Fatalf("delivery: %+v", d)
	}
}

// @id TEST-XDS-002 @verifies REQ-XDS-003 REQ-XDS-004
func TestTEST_XDS_002(t *testing.T) {
	c := New()
	if c.Publish(snapshot(2)) != nil {
		t.Fatal("initial publish")
	}
	if c.Publish(snapshot(2)) == nil || c.Publish(snapshot(1)) == nil {
		t.Fatal("stale version accepted")
	}
	bad := snapshot(3)
	bad.Endpoints[0].Weight = 0
	if c.Publish(bad) == nil {
		t.Fatal("invalid publication accepted")
	}
	ch, cancel := c.Subscribe("late")
	defer cancel()
	if (<-ch).Snapshot.Version != 2 {
		t.Fatal("last good overwritten")
	}
}

// @id TEST-XDS-003 @verifies REQ-XDS-005 REQ-XDS-006
func TestTEST_XDS_003(t *testing.T) {
	c := New()
	ch, cancel := c.Subscribe("p")
	defer cancel()
	c.Publish(snapshot(1))
	first := <-ch
	if c.Ack("p", first.Nonce, "") != nil || c.Acknowledged("p") != 1 {
		t.Fatal("ack not recorded")
	}
	c.Publish(snapshot(2))
	<-ch
	if c.Ack("p", first.Nonce, "") == nil {
		t.Fatal("stale nonce accepted")
	}
}

// @id TEST-XDS-004 @verifies REQ-XDS-007 REQ-XDS-008
func TestTEST_XDS_004(t *testing.T) {
	c := New()
	c.Publish(snapshot(1))
	ch, cancel := c.Subscribe("late")
	defer cancel()
	d := <-ch
	if d.Snapshot.Version != 1 {
		t.Fatal("late subscribe missing")
	}
	c.Ack("late", d.Nonce, "")
	c.Publish(snapshot(2))
	d = <-ch
	if c.Ack("late", d.Nonce, "invalid route") != nil || c.Acknowledged("late") != 1 {
		t.Fatal("NACK changed ACK")
	}
}

// @id TEST-XDS-005 @verifies REQ-XDS-009 REQ-XDS-010
func TestTEST_XDS_005(t *testing.T) {
	c := New()
	ch, cancel := c.Subscribe("slow")
	c.Publish(snapshot(1))
	c.Publish(snapshot(2))
	c.Publish(snapshot(3))
	if (<-ch).Snapshot.Version != 3 {
		t.Fatal("slow subscriber received stale config")
	}
	cancel()
	cancel()
	if _, ok := <-ch; ok {
		t.Fatal("channel remains open")
	}
	if c.Publish(snapshot(4)) != nil {
		t.Fatal("publish after unsubscribe")
	}
}

// @id TEST-XDS-006 @verifies REQ-XDS-011
func TestTEST_XDS_006(t *testing.T) {
	c := New()
	old, cancelOld := c.Subscribe("same")
	fresh, cancelFresh := c.Subscribe("same")
	defer cancelFresh()
	if _, ok := <-old; ok {
		t.Fatal("old subscription not closed")
	}
	cancelOld()
	if c.Publish(snapshot(1)) != nil {
		t.Fatal("publish")
	}
	d, ok := <-fresh
	if !ok || d.Snapshot.Version != 1 {
		t.Fatal("old cancellation removed replacement")
	}
}
