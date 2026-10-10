package b

import "example.com/r/a"

/** @id CODE-FB-001 @implements REQ-FB-001 */
func Run() int { return a.New().M() }
