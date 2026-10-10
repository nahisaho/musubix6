package rlog_test

import (
	"reflect"
	"testing"

	"raftsim/rlog"
)

func build(terms ...uint64) *rlog.Log {
	l := rlog.New()
	for _, tm := range terms {
		l.Append(tm, "c")
	}
	return l
}

func termsOf(l *rlog.Log) []uint64 {
	var out []uint64
	for i := uint64(1); i <= l.LastIndex(); i++ {
		tm, _ := l.Term(i)
		out = append(out, tm)
	}
	return out
}

/** @id TEST-RLOG-001 @verifies REQ-RLOG-001 */
func TestTEST_RLOG_001_empty(t *testing.T) {
	l := rlog.New()
	if l.LastIndex() != 0 || l.LastTerm() != 0 {
		t.Fatalf("idx=%d term=%d", l.LastIndex(), l.LastTerm())
	}
}

/** @id TEST-RLOG-002 @verifies REQ-RLOG-002 */
func TestTEST_RLOG_002_append(t *testing.T) {
	l := rlog.New()
	if i := l.Append(1, "a"); i != 1 {
		t.Fatalf("first index %d", i)
	}
	if i := l.Append(3, "b"); i != 2 {
		t.Fatalf("second index %d", i)
	}
	if l.LastIndex() != 2 || l.LastTerm() != 3 {
		t.Fatalf("idx=%d term=%d", l.LastIndex(), l.LastTerm())
	}
}

/** @id TEST-RLOG-003 @verifies REQ-RLOG-003 */
func TestTEST_RLOG_003_term(t *testing.T) {
	l := build(1, 2)
	cases := []struct {
		i  uint64
		tm uint64
		ok bool
	}{{0, 0, true}, {1, 1, true}, {2, 2, true}, {3, 0, false}}
	for _, c := range cases {
		tm, ok := l.Term(c.i)
		if tm != c.tm || ok != c.ok {
			t.Fatalf("Term(%d)=(%d,%v)", c.i, tm, ok)
		}
	}
}

/** @id TEST-RLOG-004 @verifies REQ-RLOG-004 */
func TestTEST_RLOG_004_match(t *testing.T) {
	l := build(1, 1, 2)
	if !rlog.New().Match(0, 0) || !l.Match(0, 0) {
		t.Fatal("(0,0) must match")
	}
	if !l.Match(3, 2) || !l.Match(1, 1) {
		t.Fatal("existing entries must match")
	}
	if l.Match(3, 1) || l.Match(4, 2) || l.Match(0, 1) {
		t.Fatal("mismatches must fail")
	}
}

/** @id TEST-RLOG-005 @verifies REQ-RLOG-005 */
func TestTEST_RLOG_005_mergeAppend(t *testing.T) {
	l := build(1, 1)
	last, ok := l.Merge(2, 1, []rlog.Entry{{Term: 2, Cmd: "x"}, {Term: 2, Cmd: "y"}})
	if !ok || last != 4 || !reflect.DeepEqual(termsOf(l), []uint64{1, 1, 2, 2}) {
		t.Fatalf("last=%d ok=%v terms=%v", last, ok, termsOf(l))
	}
	if last, ok := l.Merge(4, 2, nil); !ok || last != 4 {
		t.Fatalf("empty merge last=%d ok=%v", last, ok)
	}
}

/** @id TEST-RLOG-006 @verifies REQ-RLOG-006 */
func TestTEST_RLOG_006_mergeConflict(t *testing.T) {
	l := build(1, 1, 1, 1)
	last, ok := l.Merge(1, 1, []rlog.Entry{{Term: 1, Cmd: "c"}, {Term: 2, Cmd: "n"}})
	if !ok || last != 3 || !reflect.DeepEqual(termsOf(l), []uint64{1, 1, 2}) {
		t.Fatalf("last=%d terms=%v", last, termsOf(l))
	}
	e, _ := l.Get(3)
	if e.Cmd != "n" {
		t.Fatalf("cmd=%q", e.Cmd)
	}
}

/** @id TEST-RLOG-007 @verifies REQ-RLOG-007 */
func TestTEST_RLOG_007_staleDuplicate(t *testing.T) {
	l := build(1, 1, 2, 2)
	last, ok := l.Merge(1, 1, []rlog.Entry{{Term: 1, Cmd: "c"}, {Term: 2, Cmd: "c"}})
	if !ok || last != 3 {
		t.Fatalf("last=%d ok=%v", last, ok)
	}
	if !reflect.DeepEqual(termsOf(l), []uint64{1, 1, 2, 2}) {
		t.Fatalf("log was truncated: %v", termsOf(l))
	}
}

/** @id TEST-RLOG-008 @verifies REQ-RLOG-008 */
func TestTEST_RLOG_008_mergeMismatch(t *testing.T) {
	l2 := build(1, 2)
	if _, ok := l2.Merge(2, 1, []rlog.Entry{{Term: 3}}); ok {
		t.Fatal("prev term mismatch must fail")
	}
	if _, ok := l2.Merge(5, 1, []rlog.Entry{{Term: 3}}); ok {
		t.Fatal("gap must fail")
	}
	if !reflect.DeepEqual(termsOf(l2), []uint64{1, 2}) {
		t.Fatalf("log changed: %v", termsOf(l2))
	}
}

/** @id TEST-RLOG-009 @verifies REQ-RLOG-009 */
func TestTEST_RLOG_009_upToDate(t *testing.T) {
	l := build(1, 2, 2) // lastTerm 2, lastIdx 3
	cases := []struct {
		term, idx uint64
		want      bool
	}{{3, 1, true}, {2, 3, true}, {2, 4, true}, {2, 2, false}, {1, 9, false}}
	for _, c := range cases {
		if got := l.UpToDate(c.term, c.idx); got != c.want {
			t.Fatalf("UpToDate(%d,%d)=%v", c.term, c.idx, got)
		}
	}
	if !rlog.New().UpToDate(0, 0) {
		t.Fatal("empty vs empty is up to date")
	}
}

/** @id TEST-RLOG-010 @verifies REQ-RLOG-010 */
func TestTEST_RLOG_010_slice(t *testing.T) {
	l := build(1, 2, 3, 4)
	s := l.Slice(2, 2)
	if len(s) != 2 || s[0].Term != 2 || s[1].Term != 3 {
		t.Fatalf("slice %v", s)
	}
	s[0].Term = 99
	if tm, _ := l.Term(2); tm != 2 {
		t.Fatal("slice must be a copy")
	}
	if len(l.Slice(4, 10)) != 1 || len(l.Slice(5, 1)) != 0 || len(l.Slice(0, 1)) != 0 || len(l.Slice(1, 0)) != 0 {
		t.Fatal("bounds")
	}
}
