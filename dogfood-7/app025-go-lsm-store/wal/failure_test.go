package wal

import (
	"os"
	"testing"
)

type failOnceFile struct {
	*os.File
	mode   string
	failed bool
	writes int
}

func (f *failOnceFile) Write(p []byte) (int, error) {
	f.writes++
	if f.mode == "write" && !f.failed {
		f.failed = true
		n, err := f.File.Write(p[:3])
		if err != nil {
			return n, err
		}
		return n, os.ErrPermission
	}
	return f.File.Write(p)
}
func (f *failOnceFile) Sync() error {
	if f.mode == "sync" && !f.failed {
		f.failed = true
		return os.ErrPermission
	}
	return f.File.Sync()
}

// @id TEST-WAL-011 @verifies REQ-WAL-011
func TestTEST_WAL_011(t *testing.T) {
	for _, mode := range []string{"write", "sync"} {
		t.Run(mode, func(t *testing.T) {
			p := logPath(t)
			l := openLog(t, p)
			appendRecord(t, l, row("old", 1))
			spy := &failOnceFile{File: l.file.(*os.File), mode: mode}
			l.file = spy
			if err := l.Append(row("uncertain", 2)); err == nil {
				t.Fatal("injected error missing")
			}
			if err := l.Append(row("unsafe", 3)); err == nil {
				t.Fatal("poisoned WAL accepted append")
			}
			if spy.writes != 1 {
				t.Fatal("append reached failed file")
			}
			l.Close()
			l = openLog(t, p)
			appendRecord(t, l, row("safe", 4))
			l.Close()
			rs, err := Recover(p)
			if err != nil || len(rs) < 2 || rs[len(rs)-1].Key != "safe" {
				t.Fatalf("reconciliation: %v %v", rs, err)
			}
		})
	}
}
