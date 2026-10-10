package quorum

import (
	"reflect"
	"testing"
)

// @id TEST-QUORUM-001 @verifies REQ-QUORUM-001 REQ-QUORUM-002 REQ-QUORUM-003 REQ-QUORUM-004 REQ-QUORUM-005 REQ-QUORUM-006 REQ-QUORUM-007 REQ-QUORUM-008
func TestTEST_QUORUM_001_Joint(t *testing.T) {
	v := []int{3, 1, 2}
	c, err := New(v, nil)
	if err != nil {
		t.Fatal(err)
	}
	v[0] = 99
	if !c.Has(map[int]bool{1: true, 3: true}) {
		t.Fatal("copy/majority")
	}
	if c.Has(map[int]bool{1: true, 99: true}) || c.Has(map[int]bool{1: true}) {
		t.Fatal("minority/nonmember")
	}
	if _, e := New(nil, nil); e == nil {
		t.Fatal("empty")
	}
	if _, e := New([]int{1, 1}, nil); e == nil {
		t.Fatal("duplicate")
	}
	j, e := New([]int{1, 2, 3}, []int{3, 4, 5})
	if e != nil || !j.Has(map[int]bool{1: true, 3: true, 4: true}) {
		t.Fatal("joint quorum")
	}
	if j.Has(map[int]bool{1: true, 2: true}) || j.Has(map[int]bool{4: true, 5: true}) {
		t.Fatal("joint one side")
	}
	if !reflect.DeepEqual(j.Members(), []int{1, 2, 3, 4, 5}) {
		t.Fatal("union")
	}
	m := j.Members()
	m[0] = 999
	if j.Members()[0] != 1 {
		t.Fatal("alias")
	}
}
