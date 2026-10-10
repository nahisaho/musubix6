package network_test

import (
	"reflect"
	"testing"

	"raftsim/clock"
	"raftsim/network"
)

type rig struct {
	c   *clock.Clock
	n   *network.Net
	got []network.Msg
	at  []int64
}

func newRig(ids ...int) *rig {
	r := &rig{c: clock.New()}
	r.n = network.New(r.c, 10)
	for _, id := range ids {
		r.n.Register(id, func(m network.Msg) {
			r.got = append(r.got, m)
			r.at = append(r.at, r.c.Now())
		})
	}
	return r
}

/** @id TEST-NET-001 @verifies REQ-NET-001 */
func TestTEST_NET_001_delivery(t *testing.T) {
	r := newRig(1, 2)
	if !r.n.Send(1, 2, "hi") {
		t.Fatal("send refused")
	}
	_ = r.c.Advance(9)
	if len(r.got) != 0 {
		t.Fatal("delivered early")
	}
	_ = r.c.Advance(1)
	want := []network.Msg{{From: 1, To: 2, Payload: "hi"}}
	if !reflect.DeepEqual(r.got, want) || r.at[0] != 10 {
		t.Fatalf("got %v at %v", r.got, r.at)
	}
}

/** @id TEST-NET-002 @verifies REQ-NET-002 */
func TestTEST_NET_002_unregistered(t *testing.T) {
	r := newRig(1)
	if r.n.Send(1, 7, "x") {
		t.Fatal("must refuse")
	}
	_ = r.c.Advance(100)
	st := r.n.Stats()
	if st.Sent != 1 || st.Dropped != 1 || st.Delivered != 0 {
		t.Fatalf("%+v", st)
	}
}

/** @id TEST-NET-003 @verifies REQ-NET-003 */
func TestTEST_NET_003_fifoPerLink(t *testing.T) {
	r := newRig(1, 2)
	r.n.SetLatency(1, 2, 50)
	r.n.Send(1, 2, "slow")
	r.n.SetLatency(1, 2, 1)
	r.n.Send(1, 2, "fast")
	_ = r.c.Advance(100)
	if len(r.got) != 2 || r.got[0].Payload != "slow" || r.got[1].Payload != "fast" {
		t.Fatalf("order %v", r.got)
	}
	if r.at[0] != 50 || r.at[1] != 50 {
		t.Fatalf("times %v", r.at)
	}
}

/** @id TEST-NET-004 @verifies REQ-NET-004 */
func TestTEST_NET_004_partition(t *testing.T) {
	r := newRig(1, 2, 3, 4)
	r.n.Partition([]int{1, 2}, []int{3})
	if !r.n.Send(1, 2, "in") || r.n.Send(1, 3, "x") || r.n.Send(3, 1, "x") {
		t.Fatal("group rules")
	}
	if r.n.Send(4, 1, "x") || r.n.Send(1, 4, "x") {
		t.Fatal("unlisted node must be isolated")
	}
	if !r.n.Send(4, 4, "self") {
		t.Fatal("loopback must work")
	}
	_ = r.c.Advance(20)
	if len(r.got) != 2 {
		t.Fatalf("delivered %v", r.got)
	}
}

/** @id TEST-NET-005 @verifies REQ-NET-005 */
func TestTEST_NET_005_heal(t *testing.T) {
	r := newRig(1, 2, 3)
	r.n.Partition([]int{1}, []int{2, 3})
	r.n.Cut(2, 3)
	r.n.SetDown(3, true)
	r.n.Heal()
	if !r.n.Send(1, 2, "a") || !r.n.Send(2, 3, "b") == false && false {
		t.Fatal("healed link")
	}
	if r.n.Send(2, 3, "b") {
		t.Fatal("down node must stay down after Heal")
	}
	r.n.SetDown(3, false)
	if !r.n.Send(2, 3, "c") {
		t.Fatal("cut must be cleared by Heal")
	}
}

/** @id TEST-NET-006 @verifies REQ-NET-006 */
func TestTEST_NET_006_cut(t *testing.T) {
	r := newRig(1, 2)
	r.n.Cut(1, 2)
	if r.n.Send(1, 2, "x") {
		t.Fatal("1->2 must be blocked")
	}
	if !r.n.Send(2, 1, "y") {
		t.Fatal("2->1 must stay open")
	}
	r.n.Restore(1, 2)
	if !r.n.Send(1, 2, "z") {
		t.Fatal("restored")
	}
}

/** @id TEST-NET-007 @verifies REQ-NET-007 */
func TestTEST_NET_007_latency(t *testing.T) {
	r := newRig(1, 2)
	r.n.SetLatency(1, 2, 3)
	r.n.Send(1, 2, "a")
	r.n.Send(2, 1, "b")
	_ = r.c.Advance(10)
	if !reflect.DeepEqual(r.at, []int64{3, 10}) {
		t.Fatalf("times %v", r.at)
	}
	r.n.SetLatency(1, 2, -4)
	r.n.Send(1, 2, "c")
	_ = r.c.Advance(0)
	if len(r.got) != 3 || r.at[2] != 10 {
		t.Fatalf("zero latency: %v %v", r.got, r.at)
	}
}

/** @id TEST-NET-008 @verifies REQ-NET-008 */
func TestTEST_NET_008_down(t *testing.T) {
	r := newRig(1, 2)
	r.n.SetDown(2, true)
	if r.n.Send(1, 2, "x") || r.n.Send(2, 1, "y") {
		t.Fatal("down node must not send/receive")
	}
	r.n.SetDown(2, false)
	if !r.n.Send(1, 2, "z") {
		t.Fatal("up again")
	}
}

/** @id TEST-NET-009 @verifies REQ-NET-009 */
func TestTEST_NET_009_statsInvariant(t *testing.T) {
	r := newRig(1, 2, 3)
	check := func() {
		st := r.n.Stats()
		if st.Sent != st.Delivered+st.Dropped+st.InFlight {
			t.Fatalf("invariant broken %+v", st)
		}
	}
	for i := 0; i < 5; i++ {
		r.n.Send(1, 2, i)
		r.n.Send(1, 9, i)
		check()
	}
	_ = r.c.Advance(5)
	check()
	st := r.n.Stats()
	if st.Sent != 10 || st.InFlight != 5 || st.Dropped != 5 {
		t.Fatalf("%+v", st)
	}
	_ = r.c.Advance(10)
	check()
	if r.n.Stats().Delivered != 5 {
		t.Fatalf("%+v", r.n.Stats())
	}
}

/** @id TEST-NET-010 @verifies REQ-NET-010 */
func TestTEST_NET_010_inFlightDropped(t *testing.T) {
	r := newRig(1, 2, 3)
	r.n.Send(1, 2, "a")
	r.n.Send(1, 3, "b")
	r.n.Send(3, 3, "self")
	_ = r.c.Advance(5)
	r.n.Partition([]int{1, 3}, []int{2})
	_ = r.c.Advance(10)
	if len(r.got) != 2 || r.got[0].Payload != "b" || r.got[1].Payload != "self" {
		t.Fatalf("got %v", r.got)
	}
	st := r.n.Stats()
	if st.Dropped != 1 || st.InFlight != 0 || st.Sent != 3 {
		t.Fatalf("%+v", st)
	}
	r.n.Heal()
	r.n.Send(2, 1, "c")
	r.n.SetDown(1, true)
	_ = r.c.Advance(10)
	r.n.SetDown(1, false)
	r.n.Send(1, 2, "d")
	r.n.Cut(1, 2)
	r.n.Heal()
	_ = r.c.Advance(10)
	if len(r.got) != 3 || r.got[2].Payload != "d" {
		t.Fatalf("heal-before-delivery must deliver: %v", r.got)
	}
	if st := r.n.Stats(); st.Dropped != 2 || st.Sent != st.Delivered+st.Dropped+st.InFlight {
		t.Fatalf("%+v", st)
	}
}
