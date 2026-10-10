package client

import "dogfood/impactlocal/pkg"

// @id CODE-CLIENT-001 @implements REQ-CLIENT-001
func Size(key string) int { return pkg.Run(key) }
