package spikes

import (
	"dogfood/lsm/memtable"
	"dogfood/lsm/store"
	"dogfood/lsm/wal"
	"os"
	"path/filepath"
	"testing"
)

func TestRecoveredSequenceExhaustion(t *testing.T) {
	d := "../.runtime/spike-sequence"
	if err := os.MkdirAll(d, 0755); err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(d)
	log, err := wal.Open(filepath.Join(d, "wal.log"))
	if err != nil {
		t.Fatal(err)
	}
	r := memtable.Record{Key: "\xff", Seq: ^uint64(0) - 1, Value: []byte{255}}
	if err = log.Append(r); err != nil {
		t.Fatal(err)
	}
	if err = log.Close(); err != nil {
		t.Fatal(err)
	}
	db, err := store.Open(d)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	next, err := db.Put("final", []byte("value"))
	if err != nil || next != ^uint64(0) {
		t.Fatalf("last sequence: %d %v", next, err)
	}
	if _, err = db.Put("overflow", nil); err == nil {
		t.Fatal("sequence overflow accepted")
	}
	v, ok := db.Get("\xff", db.Snapshot())
	if !ok || len(v) != 1 || v[0] != 255 {
		t.Fatal("binary WAL replay")
	}
}
