package client_test

import (
	"example.test/alias/client"
	"example.test/alias/model"
	"testing"
)

// @id TEST-CONSUMER-001 @verifies REQ-CONSUMER-001
func TestTEST_CONSUMER_001(t *testing.T) {
	if client.Read(model.Base{}) != 7 {
		t.Fatal("original type Count")
	}
}
