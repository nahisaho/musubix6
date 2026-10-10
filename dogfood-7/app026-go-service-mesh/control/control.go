package control

import (
	mesh "dogfood.mesh"
	"fmt"
	"sync"
)

type Delivery struct {
	Snapshot mesh.Snapshot
	Nonce    string
}
type subscriber struct {
	ch      chan Delivery
	nonce   string
	version uint64
	acked   uint64
}
type Control struct {
	mu      sync.Mutex
	current mesh.Snapshot
	serial  uint64
	subs    map[string]*subscriber
}

func New() *Control { return &Control{subs: make(map[string]*subscriber)} }

// @id CODE-XDS-001 @implements REQ-XDS-001 REQ-XDS-002 REQ-XDS-003 REQ-XDS-004 REQ-XDS-009
func (c *Control) Publish(s mesh.Snapshot) error {
	if err := s.Validate(); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if s.Version <= c.current.Version {
		return fmt.Errorf("non-increasing version")
	}
	c.current = s.Clone()
	for _, sub := range c.subs {
		c.deliver(sub)
	}
	return nil
}
func (c *Control) deliver(sub *subscriber) {
	c.serial++
	sub.nonce = fmt.Sprintf("%d:%d", c.current.Version, c.serial)
	sub.version = c.current.Version
	select {
	case <-sub.ch:
	default:
	}
	sub.ch <- Delivery{Snapshot: c.current.Clone(), Nonce: sub.nonce}
}

// @id CODE-XDS-002 @implements REQ-XDS-008 REQ-XDS-010 REQ-XDS-011
func (c *Control) Subscribe(id string) (<-chan Delivery, func()) {
	c.mu.Lock()
	if old := c.subs[id]; old != nil {
		close(old.ch)
	}
	sub := &subscriber{ch: make(chan Delivery, 1)}
	c.subs[id] = sub
	if c.current.Version > 0 {
		c.deliver(sub)
	}
	c.mu.Unlock()
	var once sync.Once
	return sub.ch, func() {
		once.Do(func() {
			c.mu.Lock()
			defer c.mu.Unlock()
			if current := c.subs[id]; current == sub {
				delete(c.subs, id)
				close(current.ch)
			}
		})
	}
}

// @id CODE-XDS-003 @implements REQ-XDS-005 REQ-XDS-006 REQ-XDS-007
func (c *Control) Ack(id, nonce, reason string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	sub := c.subs[id]
	if sub == nil || sub.nonce == "" || nonce != sub.nonce {
		return fmt.Errorf("stale or unknown nonce")
	}
	if reason == "" {
		sub.acked = sub.version
	}
	return nil
}
func (c *Control) Acknowledged(id string) uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	if sub := c.subs[id]; sub != nil {
		return sub.acked
	}
	return 0
}
