package client

import "testing"

// @id TEST-CLIENT-001 @verifies REQ-CLIENT-001
func TestTEST_CLIENT_001(t *testing.T) {
	if Size("abc") != 3 { t.Fatal("size changed") }
}
