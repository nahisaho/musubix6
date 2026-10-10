package engine

import (
	"encoding/json"
	"errors"
	"example.com/runtime/cgroup"
	"example.com/runtime/internal/oci"
	"example.com/runtime/overlay"
	"sync"
)

type State string

const (
	Created State = "created"
	Running State = "running"
	Paused  State = "paused"
	Stopped State = "stopped"
	Deleted State = "deleted"
)

type Container struct {
	ID     string
	Spec   oci.Spec
	FS     *overlay.FS
	Group  *cgroup.Group
	State  State
	Events []State
	mu     sync.Mutex
}

// @id CODE-LIFE-001 @implements REQ-LIFE-001 REQ-LIFE-002 REQ-LIFE-003 REQ-LIFE-004 REQ-LIFE-005 REQ-LIFE-006 REQ-LIFE-007 REQ-LIFE-008
func New(id string, spec oci.Spec, fs *overlay.FS) (*Container, error) {
	if id == "" || fs == nil {
		return nil, errors.New("invalid container")
	}
	raw, err := json.Marshal(spec)
	if err != nil {
		return nil, err
	}
	spec, err = oci.Parse(raw)
	if err != nil {
		return nil, err
	}
	return &Container{ID: id, Spec: spec, FS: fs, Group: cgroup.New(spec.Limits), State: Created}, nil
}

var transitions = map[State]map[string]State{
	Created: {"start": Running, "delete": Deleted},
	Running: {"pause": Paused, "stop": Stopped},
	Paused:  {"resume": Running, "stop": Stopped},
	Stopped: {"start": Running, "delete": Deleted},
	Deleted: {},
}

func (c *Container) Apply(action string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	next, ok := transitions[c.State][action]
	if !ok {
		return errors.New("illegal transition")
	}
	if next == Stopped {
		if err := c.Group.Release(c.Group.Snapshot()); err != nil {
			return err
		}
	}
	c.State = next
	c.Events = append(c.Events, next)
	return nil
}
func (c *Container) Execute(u cgroup.Usage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.State != Running {
		return errors.New("container not running")
	}
	return c.Group.Reserve(u)
}
