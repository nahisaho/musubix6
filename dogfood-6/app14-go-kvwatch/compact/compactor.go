package compact

import (
	"sync"

	"kvwatch/mvcc"
)

type Mode int

const (
	ModeRevision Mode = iota
	ModePeriodic
)

type Config struct {
	Mode      Mode
	Retention int64
	Window    int64
}

type Result struct {
	Rev       int64
	Removed   int
	Compacted bool
}

type checkpoint struct{ at, rev int64 }

type Compactor struct {
	mu    sync.Mutex
	store *mvcc.Store
	cfg   Config
	cps   []checkpoint
}

func New(s *mvcc.Store, cfg Config) *Compactor { return &Compactor{store: s, cfg: cfg} }

func (c *Compactor) compactTo(target int64) (Result, error) {
	if target <= 0 || target <= c.store.CompactRev() {
		return Result{}, nil
	}
	removed, err := c.store.Compact(target)
	if err == mvcc.ErrCompacted {
		return Result{}, nil
	}
	if err != nil {
		return Result{}, err
	}
	return Result{Rev: target, Removed: removed, Compacted: true}, nil
}

// Run compacts to currentRev-Retention (revision mode only).
// @id CODE-COMPACT-004 @implements REQ-COMPACT-006 REQ-COMPACT-008
func (c *Compactor) Run() (Result, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cfg.Mode != ModeRevision {
		return Result{}, nil
	}
	return c.compactTo(c.store.Rev() - c.cfg.Retention)
}

// Tick records a (time, revision) checkpoint and compacts to the newest checkpoint at least Window old.
// @id CODE-COMPACT-005 @implements REQ-COMPACT-007
func (c *Compactor) Tick(now int64) (Result, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cps = append(c.cps, checkpoint{at: now, rev: c.store.Rev()})
	if c.cfg.Mode != ModePeriodic {
		return Result{}, nil
	}
	pick := -1
	for i, cp := range c.cps {
		if cp.at <= now-c.cfg.Window {
			pick = i
		}
	}
	if pick < 0 {
		return Result{}, nil
	}
	target := c.cps[pick].rev
	c.cps = c.cps[pick:]
	return c.compactTo(target)
}
