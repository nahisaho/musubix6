// Package node implements a single Raft node (election + replication).
package node

import (
	"errors"

	"raftsim/clock"
	"raftsim/rlog"
)

type Role int

const (
	Follower Role = iota
	Candidate
	Leader
)

var ErrNotLeader = errors.New("node: not leader")

type RequestVote struct {
	Term              uint64
	Candidate         int
	LastIdx, LastTerm uint64
}

type VoteResp struct {
	Term    uint64
	Granted bool
}

type AppendEntries struct {
	Term              uint64
	Leader            int
	PrevIdx, PrevTerm uint64
	Entries           []rlog.Entry
	Commit            uint64
}

type AppendResp struct {
	Term    uint64
	Success bool
	Match   uint64
}

type Config struct {
	ID                                  int
	Peers                               []int
	Clock                               *clock.Clock
	Send                                func(to int, m any)
	Apply                               func(idx uint64, e rlog.Entry)
	Seed                                uint64
	ElectionMin, ElectionMax, Heartbeat int64
}
