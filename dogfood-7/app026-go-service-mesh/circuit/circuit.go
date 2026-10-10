package circuit

import (
	"fmt"
	"sync"
)

type Circuit struct {
	mu                               sync.Mutex
	max, threshold, active, failures int
	cooldown, opened                 int64
	state                            string
	generation                       uint64
	probe                            bool
}

func New(max, threshold int, cooldown int64) *Circuit {
	if max <= 0 || threshold <= 0 || cooldown < 0 {
		panic("invalid circuit configuration")
	}
	return &Circuit{max: max, threshold: threshold, cooldown: cooldown, state: "closed"}
}

// @id CODE-CIRCUIT-001 @implements REQ-CIRCUIT-001 REQ-CIRCUIT-002 REQ-CIRCUIT-006 REQ-CIRCUIT-007 REQ-CIRCUIT-008
func (c *Circuit) Acquire(now int64) (func(bool, int64), error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.state == "open" {
		if now < c.opened || now-c.opened < c.cooldown {
			return nil, fmt.Errorf("circuit open")
		}
		c.state = "half-open"
	}
	if c.active >= c.max || (c.state == "half-open" && c.probe) {
		return nil, fmt.Errorf("capacity exhausted")
	}
	isProbe := c.state == "half-open"
	if isProbe {
		c.probe = true
	}
	c.active++
	generation := c.generation
	var once sync.Once
	return func(success bool, at int64) { once.Do(func() { c.complete(generation, isProbe, success, at) }) }, nil
}

// @id CODE-CIRCUIT-002 @implements REQ-CIRCUIT-003 REQ-CIRCUIT-004 REQ-CIRCUIT-005 REQ-CIRCUIT-009 REQ-CIRCUIT-010
func (c *Circuit) State() string { c.mu.Lock(); defer c.mu.Unlock(); return c.state }
func (c *Circuit) complete(generation uint64, probe, success bool, now int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.active--
	if generation != c.generation {
		return
	}
	if probe {
		c.probe = false
		if success {
			c.state = "closed"
			c.failures = 0
			return
		}
		c.open(now)
		return
	}
	if c.state != "closed" {
		return
	}
	if success {
		c.failures = 0
	} else {
		c.failures++
		if c.failures >= c.threshold {
			c.open(now)
		}
	}
}
func (c *Circuit) open(now int64) { c.state = "open"; c.opened = now; c.generation++; c.probe = false }
