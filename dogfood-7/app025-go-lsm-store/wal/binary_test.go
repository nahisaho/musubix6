package wal

import "testing"

// @id TEST-WAL-012 @verifies REQ-WAL-001
func TestTEST_WAL_012(t *testing.T) {
	p := logPath(t)
	l := openLog(t, p)
	for i, k := range []string{"\xff", "\xfe", "nul\x00key"} {
		appendRecord(t, l, row(k, uint64(i+1)))
	}
	l.Close()
	rs, err := Recover(p)
	if err != nil || len(rs) != 3 || rs[0].Key != "\xff" || rs[1].Key != "\xfe" || rs[2].Key != "nul\x00key" {
		t.Fatalf("binary WAL roundtrip: %v %v", rs, err)
	}
}
