package subtest

import "testing"

func TestTEST_TABLE_001(t *testing.T) {
	// @id TEST-TABLE-001 @verifies REQ-TABLE-001
	t.Run("TEST_TABLE_001", func(t *testing.T) {
		if Add(2, 3) != 5 {
			t.Fatal("expected 5")
		}
	})
	t.Run("unrelated", func(t *testing.T) { t.Fatal("unrelated sibling failure") })
}
