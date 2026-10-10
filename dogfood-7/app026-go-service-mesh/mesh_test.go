package mesh

import "testing"

// @id TEST-MODEL-001 @verifies REQ-MODEL-001 REQ-MODEL-002
func TestTEST_MODEL_001(t *testing.T) {
	e := Endpoint{ID: "a", Address: "a:80", Weight: 1, Healthy: true}
	if err := e.Validate(); err != nil {
		t.Fatal(err)
	}
	e.ID = ""
	if e.Validate() == nil {
		t.Fatal("empty id accepted")
	}
}

// @id TEST-MODEL-002 @verifies REQ-MODEL-003 REQ-MODEL-004
func TestTEST_MODEL_002(t *testing.T) {
	e := Endpoint{ID: "a", Weight: 1}
	if e.Validate() == nil {
		t.Fatal("empty address accepted")
	}
	e.Address = "a:80"
	for _, weight := range []int{0, -1} {
		e.Weight = weight
		if e.Validate() == nil {
			t.Fatal("nonpositive weight accepted")
		}
	}
}

// @id TEST-MODEL-003 @verifies REQ-MODEL-005 REQ-MODEL-006
func TestTEST_MODEL_003(t *testing.T) {
	e := Endpoint{ID: "a", Address: "a:80", Weight: 1}
	if (Snapshot{Version: 1, Endpoints: []Endpoint{e, e}}).Validate() == nil {
		t.Fatal("duplicate id accepted")
	}
	if (Snapshot{Version: 0}).Validate() == nil {
		t.Fatal("zero version accepted")
	}
	if (Snapshot{Version: 1}).Validate() != nil {
		t.Fatal("empty draining snapshot rejected")
	}
}

// @id TEST-MODEL-004 @verifies REQ-MODEL-007 REQ-MODEL-008
func TestTEST_MODEL_004(t *testing.T) {
	s := Snapshot{Version: 1, Endpoints: []Endpoint{{ID: "a", Metadata: map[string]string{"zone": "east"}}}}
	c := s.Clone()
	c.Endpoints[0].ID = "changed"
	c.Endpoints[0].Metadata["zone"] = "west"
	if s.Endpoints[0].ID != "a" || s.Endpoints[0].Metadata["zone"] != "east" {
		t.Fatal("clone aliases source")
	}
}

// @id TEST-MODEL-005 @verifies REQ-MODEL-009 REQ-MODEL-010
func TestTEST_MODEL_005(t *testing.T) {
	got := Eligible([]Endpoint{{ID: "b", Healthy: true}, {ID: "x"}, {ID: "a", Healthy: true}})
	if len(got) != 2 || got[0].ID != "b" || got[1].ID != "a" {
		t.Fatalf("eligible order: %v", got)
	}
}
