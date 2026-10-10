package client

import "example.com/promoted/internal/model"

// @id CODE-CLIENT-001 @implements REQ-CLIENT-001
func Value() int { return model.NewShell().Value() }
