package tx

import "testing"

// @id TEST-TX-001 @verifies REQ-TX-001 REQ-TX-002
func TestTEST_TX_001(t *testing.T) {
	m := New()
	for i := 0; i < 2; i++ {
		tag, err := m.Apply("BEGIN")
		if err != nil || tag != "BEGIN" || m.State != 'T' {
			t.Fatalf("begin %s %v %c", tag, err, m.State)
		}
	}
}

// @id TEST-TX-002 @verifies REQ-TX-003 REQ-TX-004
func TestTEST_TX_002(t *testing.T) {
	for _, failed := range []bool{false, true} {
		m := New()
		m.Apply("BEGIN")
		if failed {
			m.Apply("FAIL")
		}
		tag, err := m.Apply("COMMIT")
		want := "COMMIT"
		if failed {
			want = "ROLLBACK"
		}
		if err != nil || tag != want || m.State != 'I' {
			t.Fatalf("commit %s %v %c", tag, err, m.State)
		}
	}
}

// @id TEST-TX-003 @verifies REQ-TX-005 REQ-TX-006
func TestTEST_TX_003(t *testing.T) {
	for _, s := range []byte{'I', 'T', 'E'} {
		m := Machine{State: s}
		tag, err := m.Apply("ROLLBACK")
		if err != nil || tag != "ROLLBACK" || m.State != 'I' {
			t.Fatal("rollback")
		}
	}
	m := New()
	if _, err := m.Apply("COMMIT"); err != nil || m.State != 'I' {
		t.Fatal("idle commit")
	}
}

// @id TEST-TX-004 @verifies REQ-TX-007 REQ-TX-008
func TestTEST_TX_004(t *testing.T) {
	for _, row := range []struct{ from, to byte }{{'I', 'I'}, {'T', 'E'}, {'E', 'E'}} {
		m := Machine{State: row.from}
		m.Apply("FAIL")
		if m.State != row.to {
			t.Fatalf("%c -> %c", row.from, m.State)
		}
	}
}

// @id TEST-TX-005 @verifies REQ-TX-009 REQ-TX-010
func TestTEST_TX_005(t *testing.T) {
	for _, s := range []byte{'I', 'T', 'E'} {
		for _, ev := range []string{"QUERY", "BEGIN", "COMMIT", "ROLLBACK", "FAIL", "UNKNOWN"} {
			t.Run(string(s)+ev, func(t *testing.T) {
				m := Machine{State: s}
				_, err := m.Apply(ev)
				reject := ev == "UNKNOWN" || s == 'E' && (ev == "QUERY" || ev == "BEGIN")
				if (err != nil) != reject {
					t.Fatalf("policy: %c %s %v", s, ev, err)
				}
				if reject && m.State != s {
					t.Fatal("failed event mutated state")
				}
			})
		}
	}
	m := Machine{State: 'E'}
	_, err := m.Apply("QUERY")
	if err == nil || err.Error() != "25P02: transaction aborted" {
		t.Fatalf("sqlstate: %v", err)
	}
}
