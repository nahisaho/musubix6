//go:build ignore

package main

import (
	"fmt"
	"hash/fnv"
	"sync"
)

func main() {
	ch := make(chan int, 1)
	ch <- 1
	<-ch
	ch <- 2
	close(ch)
	if <-ch != 2 { panic("channel replacement") }
	h := fnv.New64a()
	h.Write([]byte("route"))
	var once sync.Once
	n := 0
	once.Do(func() { n++ })
	once.Do(func() { n++ })
	if n != 1 || h.Sum64() == 0 { panic("runtime invariants") }
	fmt.Println("channel replacement, closure, FNV, idempotent completion: PASS")
}
