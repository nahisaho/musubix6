package client

import "example.test/alias/model"

// @id CODE-CONSUMER-001 @implements REQ-CONSUMER-001
func Read(s model.Base) int { return s.Count() }
