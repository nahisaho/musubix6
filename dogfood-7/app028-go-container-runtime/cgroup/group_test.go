package cgroup

import (
	"example.com/runtime/internal/oci"
	"math"
	"sync"
	"testing"
)

// @id TEST-CG-001 @verifies REQ-CG-001 REQ-CG-002 REQ-CG-003 REQ-CG-004 REQ-CG-005 REQ-CG-006 REQ-CG-007 REQ-CG-008
func TestTEST_CG_001_Accounting(t *testing.T) {
	g := New(oci.Limits{Memory: 10, CPU: 2, Pids: 1})
	if e := g.Reserve(Usage{10, 2, 1}); e != nil {
		t.Fatal(e)
	}
	for _, u := range []Usage{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}, {-1, 0, 0}} {
		if g.Reserve(u) == nil {
			t.Fatal("invalid reserve")
		}
	}
	if g.Snapshot() != (Usage{10, 2, 1}) {
		t.Fatal("non atomic rejection")
	}
	if g.Release(Usage{11, 0, 0}) == nil || g.Release(Usage{-1, 0, 0}) == nil {
		t.Fatal("bad release")
	}
	if g.Release(Usage{10, 2, 1}) != nil || g.Snapshot() != (Usage{}) {
		t.Fatal("release")
	}
	unlimited := New(oci.Limits{})
	if unlimited.Reserve(Usage{100, 100, 100}) != nil {
		t.Fatal("zero means unlimited")
	}
	overflow := New(oci.Limits{})
	_ = overflow.Reserve(Usage{Memory: math.MaxInt64})
	if overflow.Reserve(Usage{Memory: 1}) == nil {
		t.Fatal("overflow")
	}
	concurrent := New(oci.Limits{Memory: 16})
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _ = concurrent.Reserve(Usage{Memory: 1}) }()
	}
	wg.Wait()
	if concurrent.Snapshot().Memory != 16 {
		t.Fatal("race accounting")
	}
}
