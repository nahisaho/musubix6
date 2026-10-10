package memtable

// @id CODE-MEM-009 @implements REQ-MEM-008
func Count(m *Table) int { return len(m.Scan("", "", ^uint64(0))) }
