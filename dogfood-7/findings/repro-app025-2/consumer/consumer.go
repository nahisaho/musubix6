package consumer

import root "dogfood/impactroot"

// @id CODE-CONSUMER-001 @implements REQ-CONSUMER-001
func Result() int { return root.Add(1, 2) }
