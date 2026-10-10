package spikes

import (
	"crypto/sha256"
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicRenameAndChecksum(t *testing.T) {
	d := "../.runtime/spike"
	if err := os.MkdirAll(d, 0755); err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(d)
	f, err := os.Create(filepath.Join(d, "pending"))
	if err != nil {
		t.Fatal(err)
	}
	a := []byte("immutable-table")
	if _, err = f.Write(a); err != nil {
		t.Fatal(err)
	}
	if err = f.Sync(); err != nil {
		t.Fatal(err)
	}
	if err = f.Close(); err != nil {
		t.Fatal(err)
	}
	if err = os.Rename(filepath.Join(d, "pending"), filepath.Join(d, "published")); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(d, "published"))
	if err != nil || sha256.Sum256(a) != sha256.Sum256(b) {
		t.Fatalf("rename/checksum: %v", err)
	}
}
