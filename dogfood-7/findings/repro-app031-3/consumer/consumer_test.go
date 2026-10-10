package consumer

import "testing"

// @id TEST-APP-001
// @verifies REQ-APP-001
func TestTEST_APP_001_sum(t *testing.T) {
	if Sum() != 3 { t.Fatal("sum") }
}
