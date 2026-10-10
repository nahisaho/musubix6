package circuit

import "testing"

// @id TEST-CIRCUIT-001 @verifies REQ-CIRCUIT-001 REQ-CIRCUIT-002
func TestTEST_CIRCUIT_001(t *testing.T) {
	c := New(1, 2, 10)
	done, err := c.Acquire(0)
	if err != nil || done == nil {
		t.Fatal("capacity unavailable")
	}
	if _, err := c.Acquire(0); err == nil {
		t.Fatal("capacity exceeded")
	}
	done(true, 0)
}

// @id TEST-CIRCUIT-002 @verifies REQ-CIRCUIT-003 REQ-CIRCUIT-004
func TestTEST_CIRCUIT_002(t *testing.T) {
	c := New(1, 2, 10)
	d, _ := c.Acquire(0)
	d(false, 0)
	d, err := c.Acquire(1)
	if err != nil {
		t.Fatal("capacity not released")
	}
	d(true, 1)
	d(false, 1)
	d, _ = c.Acquire(2)
	d(false, 2)
	if c.State() != "closed" {
		t.Fatal("success failed to reset failure streak")
	}
}

// @id TEST-CIRCUIT-003 @verifies REQ-CIRCUIT-005 REQ-CIRCUIT-006
func TestTEST_CIRCUIT_003(t *testing.T) {
	c := New(1, 2, 10)
	d, _ := c.Acquire(0)
	d(false, 0)
	d, _ = c.Acquire(1)
	d(false, 1)
	if c.State() != "open" {
		t.Fatal("threshold did not open")
	}
	if _, err := c.Acquire(10); err == nil {
		t.Fatal("cooldown not enforced")
	}
}

// @id TEST-CIRCUIT-004 @verifies REQ-CIRCUIT-007 REQ-CIRCUIT-008
func TestTEST_CIRCUIT_004(t *testing.T) {
	c := New(5, 1, 10)
	d, _ := c.Acquire(0)
	d(false, 0)
	d, err := c.Acquire(10)
	if err != nil || c.State() != "half-open" {
		t.Fatal("probe not admitted at boundary")
	}
	if _, err := c.Acquire(10); err == nil {
		t.Fatal("multiple probes admitted")
	}
	d(true, 10)
}

// @id TEST-CIRCUIT-005 @verifies REQ-CIRCUIT-009 REQ-CIRCUIT-010
func TestTEST_CIRCUIT_005(t *testing.T) {
	c := New(2, 1, 10)
	d, _ := c.Acquire(0)
	d(false, 0)
	d, _ = c.Acquire(10)
	d(false, 11)
	if _, err := c.Acquire(20); err == nil {
		t.Fatal("failed probe did not restart cooldown")
	}
	d, err := c.Acquire(21)
	if err != nil {
		t.Fatal(err)
	}
	d(true, 21)
	if c.State() != "closed" {
		t.Fatal("successful probe did not close")
	}
}
