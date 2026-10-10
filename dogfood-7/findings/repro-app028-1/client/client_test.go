package client

import "testing"

// @id TEST-CLIENT-001 @verifies REQ-CLIENT-001
func TestTEST_CLIENT_001_Value(t *testing.T) {
	if Value() != 7 {
		t.Fatal("promoted method value")
	}
}
