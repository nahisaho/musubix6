package query

import (
	"reflect"
	"testing"
)

// @id TEST-QUERY-001 @verifies REQ-QUERY-001 REQ-QUERY-002
func TestTEST_QUERY_001(t *testing.T) {
	e := New()
	s, err := e.Prepare("s", "SELECT 7, 'a,b''c', NULL")
	if err != nil || len(s.Columns) != 3 {
		t.Fatalf("prepare: %+v %v", s, err)
	}
	p, err := e.Bind("p", "s", nil)
	if err != nil {
		t.Fatal(err)
	}
	rows, done, err := p.Execute(0)
	if err != nil || !done || len(rows) != 1 || *rows[0][0] != "7" || *rows[0][1] != "a,b'c" || rows[0][2] != nil {
		t.Fatalf("rows: %+v %v", rows, err)
	}
	if _, err := e.Prepare("bad", "DROP TABLE x"); err == nil || err.(*Error).Code != "42601" {
		t.Fatalf("sql: %v", err)
	}
}

// @id TEST-QUERY-002 @verifies REQ-QUERY-003 REQ-QUERY-004
func TestTEST_QUERY_002(t *testing.T) {
	e := New()
	e.Prepare("s", "SELECT $2, $1, $2")
	a, b := "first", "second"
	args := []*string{&a, &b}
	p, err := e.Bind("p", "s", args)
	if err != nil {
		t.Fatal(err)
	}
	args[1] = nil
	rows, _, err := p.Execute(0)
	if err != nil || *rows[0][0] != "second" || *rows[0][1] != "first" || *rows[0][2] != "second" {
		t.Fatal("parameters")
	}
	if _, err := e.Bind("wrong", "s", []*string{&a}); err == nil {
		t.Fatal("arity")
	}
}

// @id TEST-QUERY-003 @verifies REQ-QUERY-005 REQ-QUERY-006
func TestTEST_QUERY_003(t *testing.T) {
	e := New()
	e.Prepare("s", "SELECT 1")
	if _, err := e.Prepare("s", "SELECT 2"); err == nil {
		t.Fatal("duplicate named")
	}
	e.Prepare("", "SELECT 1")
	if _, err := e.Prepare("", "SELECT 2"); err != nil {
		t.Fatal(err)
	}
	p, _ := e.Bind("", "", nil)
	rows, _, _ := p.Execute(0)
	if *rows[0][0] != "2" {
		t.Fatal("unnamed replacement")
	}
}

// @id TEST-QUERY-004 @verifies REQ-QUERY-007 REQ-QUERY-008
func TestTEST_QUERY_004(t *testing.T) {
	e := New()
	e.Prepare("s", "SELECT generate_series(1, 3)")
	p, err := e.Bind("p", "s", nil)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for i := 0; i < 3; i++ {
		rows, done, err := p.Execute(1)
		if err != nil || len(rows) != 1 || done != (i == 2) {
			t.Fatalf("resume %d %v %v", i, done, err)
		}
		got = append(got, *rows[0][0])
	}
	if !reflect.DeepEqual(got, []string{"1", "2", "3"}) {
		t.Fatal(got)
	}
	rows, done, err := p.Execute(0)
	if len(rows) != 0 || !done || err != nil {
		t.Fatal("completed cursor")
	}
}

// @id TEST-QUERY-005 @verifies REQ-QUERY-009 REQ-QUERY-010
func TestTEST_QUERY_005(t *testing.T) {
	e := New()
	e.Prepare("s", "SELECT 1")
	e.Bind("p", "s", nil)
	if err := e.Close('S', "s"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Statement("s"); err == nil {
		t.Fatal("statement retained")
	}
	if _, err := e.Portal("p"); err != nil {
		t.Fatal("bound portal removed")
	}
	if err := e.Close('P', "p"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Portal("p"); err == nil {
		t.Fatal("portal retained")
	}
	if err := e.Close('P', "missing"); err == nil || err.(*Error).Code != "34000" {
		t.Fatal("missing portal")
	}
}

// @id TEST-QUERY-006 @verifies REQ-QUERY-011
func TestTEST_QUERY_006(t *testing.T) {
	e := New()
	for _, sql := range []string{"SELECT 'a' 'b'", "SELECT 'a'junk'c'"} {
		if _, err := e.Prepare("", sql); err == nil {
			t.Fatalf("invalid quoted expression accepted: %s", sql)
		}
	}
	if _, err := e.Prepare("", "SELECT 'a''b'"); err != nil {
		t.Fatalf("escaped quote rejected: %v", err)
	}
}
