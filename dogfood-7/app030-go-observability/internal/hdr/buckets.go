package hdr

import "math/bits"

// @id CODE-METRIC-002 @implements REQ-METRIC-003
func Index(v int64) int {
	shift := max(0, bits.Len64(uint64(v))-11)
	return shift*1024 + int(v>>shift)
}

func Upper(index int) int64 {
	if index < 2048 {
		return int64(index)
	}
	shift := index/1024 - 1
	sub := index%1024 + 1024
	return (int64(sub+1) << shift) - 1
}
