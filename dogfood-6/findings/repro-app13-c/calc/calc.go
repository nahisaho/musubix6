package calc

/** @id CODE-C-001 @implements REQ-C-001 */
func Add(a, b int) int { return a + b }

func New() *Calc { panic("nyi: New") }

type Calc struct{}

func (c *Calc) Mul(a, b int) int { return a * b }
