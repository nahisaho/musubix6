package worker

import core "example.org/root027"

// @id CODE-WORKER-001 @implements REQ-WORKER-001
func Sum(a,b int) int { return core.Add(a,b) }
