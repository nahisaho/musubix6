package sstable

import (
	"dogfood/lsm/memtable"
	"testing"
)

// @id TEST-SST-009 @verifies REQ-SST-001
func TestTEST_SST_009(t *testing.T) {
	s := table(t, []memtable.Record{{Key: "\xff", Seq: 1, Value: []byte("one")}, {Key: "\xfe", Seq: 2, Value: []byte("two")}})
	a, ok := s.Get("\xff", 2)
	b, ok2 := s.Get("\xfe", 2)
	if !ok || !ok2 || a.Key != "\xff" || b.Key != "\xfe" || string(a.Value) != "one" || string(b.Value) != "two" {
		t.Fatal("binary SST key collision or loss")
	}
}
