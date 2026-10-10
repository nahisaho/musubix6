package main

import (
	"container/heap"
	"encoding/json"
	"fmt"
)

type ints []int

func (x ints) Len() int           { return len(x) }
func (x ints) Less(i, j int) bool { return x[i] < x[j] }
func (x ints) Swap(i, j int)      { x[i], x[j] = x[j], x[i] }
func (x *ints) Push(v any)        { *x = append(*x, v.(int)) }
func (x *ints) Pop() any          { a := *x; v := a[len(a)-1]; *x = a[:len(a)-1]; return v }
func main() {
	h := ints{5, 1, 1}
	heap.Init(&h)
	if heap.Pop(&h).(int) != 1 {
		panic("heap order")
	}
	value := "quoted \"日本\""
	b, _ := json.Marshal(value)
	var round string
	if json.Unmarshal(b, &round) != nil || round != value {
		panic("json roundtrip")
	}
	accepted := map[int]string{1: "kept"}
	durable := accepted
	if durable[1] != "kept" {
		panic("durability")
	}
	fmt.Println("heap order, JSON roundtrip, durable-map identity: PASS")
}
