package balance

import (
	mesh "dogfood.mesh"
	"testing"
)

func endpoints() []mesh.Endpoint {
	return []mesh.Endpoint{{ID: "a", Weight: 1, Healthy: true}, {ID: "b", Weight: 3, Healthy: true}}
}

// @id TEST-BALANCE-001 @verifies REQ-BALANCE-001 REQ-BALANCE-002
func TestTEST_BALANCE_001(t *testing.T) {
	b := New()
	for _, want := range []string{"a", "b", "a", "b"} {
		e, err := b.Pick("round-robin", endpoints(), "", nil)
		if err != nil || e.ID != want {
			t.Fatalf("round robin got %s, want %s: %v", e.ID, want, err)
		}
	}
}

// @id TEST-BALANCE-002 @verifies REQ-BALANCE-003 REQ-BALANCE-004
func TestTEST_BALANCE_002(t *testing.T) {
	b := New()
	for _, want := range []string{"a", "b", "b", "b", "a", "b", "b", "b"} {
		e, err := b.Pick("weighted", endpoints(), "", nil)
		if err != nil || e.ID != want {
			t.Fatalf("weighted got %s, want %s", e.ID, want)
		}
	}
}

// @id TEST-BALANCE-003 @verifies REQ-BALANCE-005 REQ-BALANCE-006
func TestTEST_BALANCE_003(t *testing.T) {
	b := New()
	e, _ := b.Pick("least-request", endpoints(), "", map[string]int{"a": 4, "b": 1})
	if e.ID != "b" {
		t.Fatal("least count ignored")
	}
	e, _ = b.Pick("least-request", endpoints(), "", map[string]int{"a": 2, "b": 2})
	if e.ID != "a" {
		t.Fatal("tie order ignored")
	}
}

// @id TEST-BALANCE-004 @verifies REQ-BALANCE-007 REQ-BALANCE-008
func TestTEST_BALANCE_004(t *testing.T) {
	b := New()
	es := endpoints()
	for _, key := range []string{"alpha", "beta", "gamma", "delta"} {
		a, _ := b.Pick("hash", es, key, nil)
		c, _ := b.Pick("hash", []mesh.Endpoint{es[1], es[0]}, key, nil)
		d, _ := b.Pick("hash", es, key, nil)
		if a.ID == "" || a.ID != c.ID || a.ID != d.ID {
			t.Fatal("unstable hash routing")
		}
	}
}

// @id TEST-BALANCE-005 @verifies REQ-BALANCE-009 REQ-BALANCE-010
func TestTEST_BALANCE_005(t *testing.T) {
	b := New()
	if _, err := b.Pick("round-robin", nil, "", nil); err == nil {
		t.Fatal("empty candidates accepted")
	}
	es := endpoints()
	es[0].Healthy = false
	e, err := b.Pick("round-robin", es, "", nil)
	if err != nil || e.ID != "b" {
		t.Fatal("unhealthy candidate selected")
	}
}
