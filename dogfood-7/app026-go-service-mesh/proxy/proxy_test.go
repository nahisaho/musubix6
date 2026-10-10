package proxy

import (
	mesh "dogfood.mesh"
	"dogfood.mesh/circuit"
	"errors"
	"testing"
)

func config() mesh.Snapshot {
	return mesh.Snapshot{Version: 1, Endpoints: []mesh.Endpoint{{ID: "a", Address: "a:80", Weight: 1, Healthy: true}, {ID: "b", Address: "b:80", Weight: 1, Healthy: true}}}
}

// @id TEST-RESILIENCE-001 @verifies REQ-RESILIENCE-001 REQ-RESILIENCE-002
func TestTEST_RESILIENCE_001(t *testing.T) {
	p := New(circuit.New(5, 10, 10), 2, 10)
	s := config()
	s.Endpoints[0].Healthy = false
	if p.Update(s) != nil {
		t.Fatal("update")
	}
	calls := 0
	got, err := p.Do(Request{Idempotent: true, Deadline: 100}, 0, 3, 1, func(e mesh.Endpoint) (string, error) {
		calls++
		if e.ID != "b" {
			t.Fatal("unhealthy routing")
		}
		return "ok", nil
	})
	if err != nil || got != "ok" || calls != 1 {
		t.Fatalf("success %q %v %d", got, err, calls)
	}
}

// @id TEST-RESILIENCE-002 @verifies REQ-RESILIENCE-003 REQ-RESILIENCE-004
func TestTEST_RESILIENCE_002(t *testing.T) {
	p := New(circuit.New(5, 20, 10), 20, 10)
	p.Update(config())
	n := 0
	call := func(e mesh.Endpoint) (string, error) {
		n++
		if n < 3 {
			return "", ErrRetryable
		}
		return "ok", nil
	}
	got, err := p.Do(Request{Idempotent: true, Deadline: 100}, 0, 2, 1, call)
	if err != nil || got != "ok" || n != 3 {
		t.Fatal("retry budget")
	}
	n = 0
	_, err = p.Do(Request{Deadline: 100}, 0, 2, 1, call)
	if err == nil || n != 1 {
		t.Fatal("non-idempotent retried")
	}
}

// @id TEST-RESILIENCE-003 @verifies REQ-RESILIENCE-005 REQ-RESILIENCE-006
func TestTEST_RESILIENCE_003(t *testing.T) {
	p := New(circuit.New(5, 20, 10), 20, 10)
	p.Update(config())
	n := 0
	_, err := p.Do(Request{Idempotent: true, Deadline: 100}, 0, 4, 1, func(mesh.Endpoint) (string, error) { n++; return "", errors.New("bad request") })
	if err == nil || n != 1 {
		t.Fatal("nonretryable retried")
	}
	n = 0
	_, err = p.Do(Request{Idempotent: true, Deadline: 5}, 0, 4, 5, func(mesh.Endpoint) (string, error) { n++; return "", ErrRetryable })
	if !errors.Is(err, ErrDeadline) || n != 1 {
		t.Fatal("deadline boundary ignored")
	}
}

// @id TEST-RESILIENCE-004 @verifies REQ-RESILIENCE-007 REQ-RESILIENCE-008
func TestTEST_RESILIENCE_004(t *testing.T) {
	p := New(circuit.New(5, 20, 10), 1, 10)
	s := config()
	s.Endpoints = s.Endpoints[:1]
	p.Update(s)
	n := 0
	call := func(mesh.Endpoint) (string, error) { n++; return "", ErrRetryable }
	p.Do(Request{Deadline: 100}, 0, 0, 1, call)
	p.Do(Request{Deadline: 100}, 9, 0, 1, call)
	if n != 1 {
		t.Fatal("ejection ignored")
	}
	p.Do(Request{Deadline: 100}, 10, 0, 1, call)
	if n != 2 {
		t.Fatal("endpoint did not return")
	}
}

// @id TEST-RESILIENCE-005 @verifies REQ-RESILIENCE-009 REQ-RESILIENCE-010
func TestTEST_RESILIENCE_005(t *testing.T) {
	c := circuit.New(1, 1, 10)
	p := New(c, 20, 10)
	p.Update(config())
	n := 0
	p.Do(Request{Deadline: 100}, 0, 0, 1, func(mesh.Endpoint) (string, error) { n++; return "", ErrRetryable })
	p.Do(Request{Deadline: 100}, 1, 0, 1, func(mesh.Endpoint) (string, error) { n++; return "ok", nil })
	if n != 1 {
		t.Fatal("open circuit called transport")
	}
	_, err := p.Do(Request{Deadline: 100}, 10, 0, 1, func(mesh.Endpoint) (string, error) { n++; return "ok", nil })
	if err != nil || n != 2 {
		t.Fatal("capacity not released")
	}
}

// @id TEST-RESILIENCE-006 @verifies REQ-RESILIENCE-011
func TestTEST_RESILIENCE_006(t *testing.T) {
	p := New(circuit.New(5, 20, 10), 20, 10)
	p.Update(config())
	n := 0
	const max = int64(1<<63 - 1)
	_, err := p.Do(Request{Idempotent: true, Deadline: max}, max-2, 2, 10, func(mesh.Endpoint) (string, error) { n++; return "", ErrRetryable })
	if !errors.Is(err, ErrDeadline) || n != 1 {
		t.Fatalf("overflow caused retry: %v, calls=%d", err, n)
	}
}

// @id TEST-RESILIENCE-007 @verifies REQ-RESILIENCE-012
func TestTEST_RESILIENCE_007(t *testing.T) {
	p := New(circuit.New(5, 20, 10), 1, 10)
	s := config()
	s.Endpoints = s.Endpoints[:1]
	p.Update(s)
	started := make(chan struct{})
	release := make(chan struct{})
	finished := make(chan error, 1)
	go func() {
		_, err := p.Do(Request{Deadline: 100}, 0, 0, 1, func(mesh.Endpoint) (string, error) { close(started); <-release; return "ok", nil })
		finished <- err
	}()
	<-started
	p.Do(Request{Deadline: 100}, 0, 0, 1, func(mesh.Endpoint) (string, error) { return "", ErrRetryable })
	close(release)
	if err := <-finished; err != nil {
		t.Fatal(err)
	}
	n := 0
	p.Do(Request{Deadline: 100}, 1, 0, 1, func(mesh.Endpoint) (string, error) { n++; return "ok", nil })
	if n != 0 {
		t.Fatal("late success cancelled active ejection")
	}
}

// @id TEST-RESILIENCE-008 @verifies REQ-RESILIENCE-013
func TestTEST_RESILIENCE_008(t *testing.T) {
	p := New(circuit.New(5, 20, 10), 1, 10)
	s := config()
	s.Endpoints = s.Endpoints[:1]
	p.Update(s)
	const max = int64(1<<63 - 1)
	n := 0
	call := func(mesh.Endpoint) (string, error) { n++; return "", ErrRetryable }
	p.Do(Request{Deadline: max}, max-2, 0, 1, call)
	p.Do(Request{Deadline: max}, max-1, 0, 1, call)
	if n != 1 {
		t.Fatal("overflow cancelled ejection")
	}
}

// @id TEST-RESILIENCE-009 @verifies REQ-RESILIENCE-014
func TestTEST_RESILIENCE_009(t *testing.T) {
	p := New(circuit.New(5, 20, 10), 1, 10)
	s := config()
	s.Endpoints = s.Endpoints[:1]
	p.Update(s)
	started := make(chan struct{})
	release := make(chan struct{})
	finished := make(chan error, 1)
	go func() {
		_, err := p.Do(Request{Deadline: 100}, 0, 0, 1, func(mesh.Endpoint) (string, error) { close(started); <-release; return "", ErrRetryable })
		finished <- err
	}()
	<-started
	p.Do(Request{Deadline: 100}, 5, 0, 1, func(mesh.Endpoint) (string, error) { return "", ErrRetryable })
	close(release)
	if err := <-finished; !errors.Is(err, ErrRetryable) {
		t.Fatal(err)
	}
	n := 0
	p.Do(Request{Deadline: 100}, 11, 0, 1, func(mesh.Endpoint) (string, error) { n++; return "ok", nil })
	if n != 0 {
		t.Fatal("late failure shortened ejection")
	}
}
