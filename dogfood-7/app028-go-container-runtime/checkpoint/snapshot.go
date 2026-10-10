package checkpoint

import (
	"bytes"
	"encoding/json"
	"errors"
	"example.com/runtime/cgroup"
	"example.com/runtime/engine"
	"example.com/runtime/internal/oci"
	"example.com/runtime/overlay"
	"io"
)

type envelope struct {
	Version int               `json:"version"`
	ID      string            `json:"id"`
	Spec    oci.Spec          `json:"spec"`
	State   engine.State      `json:"state"`
	Usage   cgroup.Usage      `json:"usage"`
	Files   map[string][]byte `json:"files"`
}

// @id CODE-SNAP-001 @implements REQ-SNAP-001 REQ-SNAP-002 REQ-SNAP-003 REQ-SNAP-004 REQ-SNAP-005 REQ-SNAP-006 REQ-SNAP-007 REQ-SNAP-008
func Save(c *engine.Container) ([]byte, error) {
	if c == nil || c.State == engine.Running || c.State == engine.Deleted {
		return nil, errors.New("checkpoint requires quiescent container")
	}
	if (c.State == engine.Created || c.State == engine.Stopped) && c.Group.Snapshot() != (cgroup.Usage{}) {
		return nil, errors.New("inactive usage")
	}
	e := envelope{Version: 1, ID: c.ID, Spec: c.Spec, State: c.State, Usage: c.Group.Snapshot(), Files: map[string][]byte{}}
	for _, name := range c.FS.List() {
		b, err := c.FS.Read(name)
		if err != nil {
			return nil, err
		}
		e.Files[name] = b
	}
	return json.Marshal(e)
}
func Restore(data []byte) (*engine.Container, error) {
	var e envelope
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&e); err != nil {
		return nil, err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return nil, errors.New("trailing checkpoint input")
	}
	if e.Version != 1 || e.Files == nil || (e.State != engine.Created && e.State != engine.Paused && e.State != engine.Stopped) {
		return nil, errors.New("invalid checkpoint")
	}
	fs := overlay.New()
	for name, b := range e.Files {
		if err := fs.Write(name, b); err != nil {
			return nil, err
		}
	}
	c, err := engine.New(e.ID, e.Spec, fs)
	if err != nil {
		return nil, err
	}
	if (e.State == engine.Created || e.State == engine.Stopped) && e.Usage != (cgroup.Usage{}) {
		return nil, errors.New("inactive usage")
	}
	if err := c.Group.Reserve(e.Usage); err != nil {
		return nil, err
	}
	c.State = e.State
	return c, nil
}
