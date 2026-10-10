package spike

import (
	"context"
	"math/bits"
	"sync"
	"testing"
)

func TestRuntimeAssumptions(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	child := context.WithValue(ctx, struct{}{}, 1)
	cancel()
	if child.Err() != context.Canceled {
		t.Fatal("cancellation lost")
	}
	if bits.Len64(2048)-11 != 1 {
		t.Fatal("HDR exponent")
	}
	var mu sync.Mutex
	total := 0
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() { defer wg.Done(); mu.Lock(); total++; mu.Unlock() }()
	}
	wg.Wait()
	if total != 8 {
		t.Fatal(total)
	}
}
