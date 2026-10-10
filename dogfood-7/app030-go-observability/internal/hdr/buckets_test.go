package hdr

import "testing"

func TestBucketBounds(t *testing.T) {
	last := 0
	for v := int64(1); v <= 1_000_000; v++ {
		index := Index(v)
		upper := Upper(index)
		if index < last || upper < v || float64(upper-v) > float64(v)*.001 {
			t.Fatalf("%d -> %d -> %d", v, index, upper)
		}
		last = index
	}
}
