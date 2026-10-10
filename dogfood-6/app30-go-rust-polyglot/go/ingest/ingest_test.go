package ingest

import (
	"errors"
	"strings"
	"testing"

	"example.com/metrics/contract"
)

var lim = contract.Limits{MaxLabels: 3, MaxLabelValueLen: 8, MaxNameLen: 16, MaxLineLen: 64, MaxSkewSeconds: 300, MaxSeries: 10}

func mustParse(t *testing.T, line string) Point {
	t.Helper()
	p, err := ParseLine(line, lim)
	if err != nil {
		t.Fatalf("ParseLine(%q): %v", line, err)
	}
	return p
}

func wantErr(t *testing.T, line string, want error) {
	t.Helper()
	if _, err := ParseLine(line, lim); !errors.Is(err, want) {
		t.Fatalf("ParseLine(%q) = %v, want %v", line, err, want)
	}
}

// @id TEST-INGEST-001
// @verifies REQ-INGEST-001
func TestTEST_INGEST_001_parse(t *testing.T) {
	p := mustParse(t, "latency{b=2,a=1} 42 1700000000")
	if p.Name != "latency" || p.Value != 42 || p.TS != 1700000000 {
		t.Fatalf("bad point %+v", p)
	}
	if len(p.Labels) != 2 || p.Labels[0] != (Label{"a", "1"}) || p.Labels[1] != (Label{"b", "2"}) {
		t.Fatalf("labels not sorted: %+v", p.Labels)
	}
}

// @id TEST-INGEST-002
// @verifies REQ-INGEST-002
func TestTEST_INGEST_002_no_labels(t *testing.T) {
	for _, line := range []string{"up 5 100", "up{} 5 100"} {
		p := mustParse(t, line)
		if p.Name != "up" || len(p.Labels) != 0 || p.Value != 5 || p.TS != 100 {
			t.Fatalf("%q: %+v", line, p)
		}
	}
}

// @id TEST-INGEST-003
// @verifies REQ-INGEST-003
func TestTEST_INGEST_003_name(t *testing.T) {
	for _, line := range []string{"9bad 1 1", "bad-name 1 1", " 1 1", "toolongnametoolongname 1 1", "{a=1} 1 1"} {
		wantErr(t, line, ErrName)
	}
	for _, line := range []string{"a_b.c9 1 1", "_x 1 1", "abcdefghijklmnop 1 1"} {
		mustParse(t, line)
	}
}

// @id TEST-INGEST-004
// @verifies REQ-INGEST-004
func TestTEST_INGEST_004_labels(t *testing.T) {
	for _, line := range []string{
		"m{1a=x} 1 1", "m{a=1,a=2} 1 1", "m{a=1,b=2,c=3,d=4} 1 1", "m{a=123456789} 1 1", "m{=x} 1 1", "m{a=1,} 1 1",
	} {
		wantErr(t, line, ErrLabels)
	}
	p := mustParse(t, `m{a=1234567\,,b=} 1 1`)
	if p.Labels[0].V != "1234567," || p.Labels[1].V != "" {
		t.Fatalf("labels %+v", p.Labels)
	}
}

// @id TEST-INGEST-005
// @verifies REQ-INGEST-005
func TestTEST_INGEST_005_value(t *testing.T) {
	for _, v := range []string{"-1", "+1", "1.5", "0x10", "18446744073709551616", "abc", "1e3"} {
		wantErr(t, "m "+v+" 1", ErrValue)
	}
	if p := mustParse(t, "m 18446744073709551615 1"); p.Value != 18446744073709551615 {
		t.Fatalf("max: %d", p.Value)
	}
	if p := mustParse(t, "m 007 1"); p.Value != 7 {
		t.Fatalf("leading zeros: %d", p.Value)
	}
}

// @id TEST-INGEST-006
// @verifies REQ-INGEST-006
func TestTEST_INGEST_006_timestamp(t *testing.T) {
	for _, ts := range []string{"-5", "abc", "1.5", "9223372036854775808", "+3"} {
		wantErr(t, "m 1 "+ts, ErrTimestamp)
	}
	if p := mustParse(t, "m 1 9223372036854775807"); p.TS != 9223372036854775807 {
		t.Fatalf("ts %d", p.TS)
	}
	if p := mustParse(t, "m 1 0"); p.TS != 0 {
		t.Fatalf("ts %d", p.TS)
	}
}

// @id TEST-INGEST-007
// @verifies REQ-INGEST-007
func TestTEST_INGEST_007_escapes_and_format(t *testing.T) {
	p := mustParse(t, `m{a=x\,y\}z\=\\v} 1 1`)
	if p.Labels[0].V != `x,y}z=\v` {
		t.Fatalf("unescaped %q", p.Labels[0].V)
	}
	for _, line := range []string{`m{a=\n} 1 1`, "m{a=x 1 1", "m 1", "m 1 2 3", `m{a=x\} 1 1`, "m{a=1}x 1 1", "m{a} 1 1", ""} {
		wantErr(t, line, ErrFormat)
	}
}

// @id TEST-INGEST-008
// @verifies REQ-INGEST-008
func TestTEST_INGEST_008_series_key(t *testing.T) {
	a := SeriesKey(mustParse(t, "m{b=2,a=1} 1 1"))
	b := SeriesKey(mustParse(t, "m{a=1,b=2} 9 9"))
	if a != b || a != `m{a="1",b="2"}` {
		t.Fatalf("keys %q %q", a, b)
	}
	p1 := Point{Name: "m", Labels: []Label{{"a", "1,b=2"}}}
	p2 := Point{Name: "m", Labels: []Label{{"a", "1"}, {"b", "2"}}}
	if SeriesKey(p1) == SeriesKey(p2) {
		t.Fatal("collision")
	}
	if got := SeriesKey(Point{Name: "m", Labels: []Label{{"a", `x,y}"\`}}}); got != `m{a="x\,y\}\"\\"}` {
		t.Fatalf("escape %q", got)
	}
	if SeriesKey(Point{Name: "m"}) != "m{}" || SeriesKey(Point{Name: "n"}) == SeriesKey(Point{Name: "m"}) {
		t.Fatal("name handling")
	}
	// the key must not depend on the order of a caller-built label slice
	if SeriesKey(Point{Name: "m", Labels: []Label{{"b", "2"}, {"a", "1"}}}) != a {
		t.Fatal("unsorted input")
	}
}

// @id TEST-INGEST-009
// @verifies REQ-INGEST-009
func TestTEST_INGEST_009_batch(t *testing.T) {
	text := "# comment\n\nm 1 1\nbad line\r\nm 2 2\r\n" + strings.Repeat("x", 65) + "\nm 3 3"
	pts, errs := ParseBatch(text, lim)
	if len(pts) != 3 || pts[0].Value != 1 || pts[1].Value != 2 || pts[2].Value != 3 {
		t.Fatalf("points %+v", pts)
	}
	if len(errs) != 2 || errs[0].Line != 4 || !errors.Is(errs[0].Err, ErrFormat) || errs[1].Line != 6 || !errors.Is(errs[1].Err, ErrTooLong) {
		t.Fatalf("errors %+v", errs)
	}
}

// @id TEST-INGEST-010
// @verifies REQ-INGEST-010
func TestTEST_INGEST_010_skew(t *testing.T) {
	if err := CheckSkew(Point{TS: 1300}, 1000, lim); err != nil {
		t.Fatal(err)
	}
	if err := CheckSkew(Point{TS: 0}, 1000, lim); err != nil {
		t.Fatal(err)
	}
	if err := CheckSkew(Point{TS: 1301}, 1000, lim); !errors.Is(err, ErrSkew) {
		t.Fatalf("got %v", err)
	}
	if err := CheckSkew(Point{TS: 9223372036854775807}, 9223372036854775000, lim); !errors.Is(err, ErrSkew) {
		t.Fatalf("overflow case: %v", err)
	}
}

// @id TEST-INGEST-011
// @verifies REQ-INGEST-011
func TestTEST_INGEST_011_dedupe(t *testing.T) {
	for _, c := range []int{0, -1} {
		if _, err := NewDeduper(c); !errors.Is(err, ErrCapacity) {
			t.Fatalf("cap %d: %v", c, err)
		}
	}
	d, err := NewDeduper(2)
	if err != nil {
		t.Fatal(err)
	}
	p1 := mustParse(t, "m{a=1,b=2} 1 10")
	p1b := mustParse(t, "m{b=2,a=1} 1 10")
	p2 := mustParse(t, "m 2 10")
	p3 := mustParse(t, "m 3 10")
	seq := []struct {
		p    Point
		want bool
	}{{p1, false}, {p1b, true}, {p2, false}, {p3, false}, {p1, false}, {p3, true}, {p2, false}}
	for i, s := range seq {
		if got := d.Seen(s.p); got != s.want {
			t.Fatalf("step %d: Seen=%v want %v", i, got, s.want)
		}
	}
	if d.Seen(mustParse(t, "m{a=1,b=2} 2 10")) {
		t.Fatal("different value must not be duplicate")
	}
}
