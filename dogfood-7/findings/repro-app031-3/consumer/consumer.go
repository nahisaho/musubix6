package consumer

import "imported.local/sdk/counter"

// @id CODE-APP-001
// @implements REQ-APP-001
func Sum() int { return counter.Add(1, 2) }
