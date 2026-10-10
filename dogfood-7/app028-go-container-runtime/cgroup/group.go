package cgroup

import (
	"errors"
	"example.com/runtime/internal/oci"
	"math"
	"sync"
)

type Usage struct{ Memory, CPU, Pids int64 }
type Group struct {
	Limits oci.Limits
	Usage  Usage
	mu     sync.Mutex
}

// @id CODE-CG-001 @implements REQ-CG-001 REQ-CG-002 REQ-CG-003 REQ-CG-004 REQ-CG-005 REQ-CG-006 REQ-CG-007 REQ-CG-008
func New(limits oci.Limits) *Group { return &Group{Limits: limits} }
func (g *Group) Reserve(u Usage) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	values := []int64{u.Memory, u.CPU, u.Pids}
	current := []int64{g.Usage.Memory, g.Usage.CPU, g.Usage.Pids}
	limits := []int64{g.Limits.Memory, g.Limits.CPU, g.Limits.Pids}
	for i, v := range values {
		if !fits(current[i], v, limits[i]) {
			return errors.New("capacity exceeded")
		}

	}
	g.Usage.Memory += u.Memory
	g.Usage.CPU += u.CPU
	g.Usage.Pids += u.Pids
	return nil
}
func (g *Group) Release(u Usage) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if u.Memory < 0 || u.CPU < 0 || u.Pids < 0 || u.Memory > g.Usage.Memory || u.CPU > g.Usage.CPU || u.Pids > g.Usage.Pids {
		return errors.New("invalid release")
	}
	g.Usage.Memory -= u.Memory
	g.Usage.CPU -= u.CPU
	g.Usage.Pids -= u.Pids
	return nil
}
func (g *Group) Snapshot() Usage {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.Usage
}

func fits(current, delta, limit int64) bool {
	return delta >= 0 && delta <= math.MaxInt64-current && limit >= 0 && (limit == 0 || current+delta <= limit)
}
