package sstable

import "hash/fnv"

// @id CODE-SST-002 @implements REQ-SST-002 REQ-SST-003
type bloom struct {
	bits  []uint64
	width uint64
}

func newBloom(n int) *bloom {
	size := n * 12
	if size < 64 {
		size = 64
	}
	return &bloom{bits: make([]uint64, (size+63)/64), width: uint64((size + 63) / 64 * 64)}
}
func hashes(k string) (uint64, uint64) {
	h := fnv.New64a()
	h.Write([]byte(k))
	a := h.Sum64()
	return a, (a >> 33) ^ 0x9e3779b97f4a7c15
}
func (b *bloom) add(k string) {
	a, c := hashes(k)
	for i := uint64(0); i < 7; i++ {
		p := (a + i*c) % b.width
		b.bits[p/64] |= 1 << (p % 64)
	}
}
func (b *bloom) contains(k string) bool {
	a, c := hashes(k)
	for i := uint64(0); i < 7; i++ {
		p := (a + i*c) % b.width
		if b.bits[p/64]&(1<<(p%64)) == 0 {
			return false
		}
	}
	return true
}
