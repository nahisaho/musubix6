package compact

import (
	"dogfood/lsm/memtable"
	"dogfood/lsm/store"
	"sort"
)

type Meta struct {
	ID       string
	Size     int64
	Level    int
	Min, Max string
}

// @id CODE-COMPACT-001 @implements REQ-COMPACT-001 REQ-COMPACT-002 REQ-COMPACT-006 REQ-COMPACT-008
func Merge(inputs [][]memtable.Record) []memtable.Record {
	type identity struct {
		key string
		seq uint64
	}
	seen := map[identity]bool{}
	var out []memtable.Record
	for _, rs := range inputs {
		for _, r := range rs {
			id := identity{r.Key, r.Seq}
			if !seen[id] {
				seen[id] = true
				out = append(out, memtable.Clone(r))
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return memtable.Less(out[i], out[j]) })
	return out
}

// @id CODE-COMPACT-002 @implements REQ-COMPACT-003 REQ-COMPACT-005
func SizeTiered(ms []Meta, fan int) []Meta {
	if fan < 2 {
		return nil
	}
	cp := append([]Meta(nil), ms...)
	sort.SliceStable(cp, func(i, j int) bool { return cp[i].Size < cp[j].Size })
	for i := 0; i+fan <= len(cp); i++ {
		if cp[i].Size <= 0 {
			continue
		}
		max := cp[i+fan-1].Size
		if max-cp[i].Size <= cp[i].Size {
			return append([]Meta(nil), cp[i:i+fan]...)
		}
	}
	return nil
}

// @id CODE-COMPACT-003 @implements REQ-COMPACT-004
func Leveled(ms []Meta, level int) []Meta {
	var base []Meta
	min, max := "", ""
	for _, m := range ms {
		if m.Level == level {
			if len(base) == 0 || m.Min < min {
				min = m.Min
			}
			if len(base) == 0 || m.Max > max {
				max = m.Max
			}
			base = append(base, m)
		}
	}
	if len(base) == 0 {
		return nil
	}
	for _, m := range ms {
		if m.Level == level+1 && m.Min <= max && m.Max >= min {
			base = append(base, m)
		}
	}
	return base
}

// @id CODE-COMPACT-004 @implements REQ-COMPACT-007
func Run(db *store.DB) error { return db.Compact() }
