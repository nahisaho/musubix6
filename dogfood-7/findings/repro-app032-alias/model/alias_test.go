package model_test

import (
	"example.test/alias/model"
	"testing"
)

// @id TEST-METHOD-001 @verifies REQ-METHOD-001
func TestTEST_METHOD_001(t *testing.T) {
	if (model.Alias{}).Count() != 7 {
		t.Fatal("alias Count")
	}
}
