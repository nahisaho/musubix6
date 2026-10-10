package quorum

import (
	"errors"
	"sort"
)

// @id CODE-QUORUM-001 @implements REQ-QUORUM-001 REQ-QUORUM-002 REQ-QUORUM-003 REQ-QUORUM-004 REQ-QUORUM-005 REQ-QUORUM-006 REQ-QUORUM-007 REQ-QUORUM-008
type Config struct{ old, new []int }

func New(old, next []int) (Config, error) {
	valid := func(v []int) bool {
		if len(v) == 0 {
			return false
		}
		seen := map[int]bool{}
		for _, id := range v {
			if id <= 0 || seen[id] {
				return false
			}
			seen[id] = true
		}
		return true
	}
	if !valid(old) || next != nil && !valid(next) {
		return Config{}, errors.New("invalid voters")
	}
	c := Config{old: append([]int(nil), old...), new: append([]int(nil), next...)}
	sort.Ints(c.old)
	sort.Ints(c.new)
	return c, nil
}
func majority(voters []int, votes map[int]bool) bool {
	n := 0
	for _, id := range voters {
		if votes[id] {
			n++
		}
	}
	return n > len(voters)/2
}
func (c Config) Has(votes map[int]bool) bool {
	return majority(c.old, votes) && (len(c.new) == 0 || majority(c.new, votes))
}
func (c Config) Members() []int {
	set := map[int]bool{}
	for _, id := range c.old {
		set[id] = true
	}
	for _, id := range c.new {
		set[id] = true
	}
	out := make([]int, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	sort.Ints(out)
	return out
}
func (c Config) Joint() bool { return len(c.new) > 0 }
