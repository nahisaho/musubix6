package consumer

import "testing"

// @id TEST-CONSUMER-001 @verifies REQ-CONSUMER-001
func TestTEST_CONSUMER_001(t *testing.T) {
	if Result() != 3 { t.Fatal("result changed") }
}
