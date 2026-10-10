//go:build ignore

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"sync"
)

func main() {
	d := json.NewDecoder(strings.NewReader(`{"a":1} {}`))
	var a map[string]int
	if d.Decode(&a) != nil {
		panic("first decode")
	}
	var extra any
	if d.Decode(&extra) == io.EOF {
		panic("trailing JSON undetected")
	}
	var mu sync.Mutex
	n := 0
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			mu.Lock()
			defer mu.Unlock()
			if n < 16 {
				n++
			}
		}()
	}
	wg.Wait()
	if n != 16 {
		panic("mutex capacity")
	}
	fmt.Println("spike: trailing JSON detected; serialized capacity=16; PASS")
}
