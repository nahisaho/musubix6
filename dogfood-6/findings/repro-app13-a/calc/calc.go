package calc

type Msg struct{ From, To int }
type Calc struct{}

func New(n int) *Calc { return &Calc{} }
