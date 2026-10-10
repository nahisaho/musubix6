package resolver_test

import (
	"context"
	"dogfood.local/dns/cache"
	"dogfood.local/dns/resolver"
	"dogfood.local/dns/transport"
	"dogfood.local/dns/wire"
	"net"
	"sync/atomic"
	"testing"
	"time"
)

func TestLoopbackEndToEnd(t *testing.T) {
	s, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	done := make(chan struct{})
	t.Cleanup(func() { s.Close(); <-done })
	go func() {
		defer close(done)
		for {
			b := make([]byte, 65535)
			n, peer, err := s.ReadFrom(b)
			if err != nil {
				return
			}
			m, err := wire.Decode(b[:n])
			if err != nil {
				continue
			}
			calls.Add(1)
			m.Flags = 0x8400
			m.Answers = []wire.RR{{Name: m.Questions[0].Name, Type: wire.A, Class: 1, TTL: 30, Data: []byte{127, 0, 0, 9}}}
			response, err := wire.Encode(m)
			if err != nil {
				continue
			}
			s.WriteTo(response, peer)
		}
	}()
	r := resolver.Resolver{Exchange: transport.UDP{Timeout: time.Second}, Roots: []string{s.LocalAddr().String()}, Cache: cache.New(4, time.Now)}
	q := wire.Question{Name: "example.", Type: wire.A, Class: 1}
	for i := 0; i < 2; i++ {
		m, err := r.Resolve(context.Background(), q)
		if err != nil || len(m.Answers) != 1 || net.IP(m.Answers[0].Data).String() != "127.0.0.9" {
			t.Fatalf("end-to-end %#v %v", m, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("cache did not suppress network exchange: %d", calls.Load())
	}
}
