package transport

import (
	"context"
	"dogfood.local/dns/wire"
	"net"
	"sync"
	"testing"
	"time"
)

func peer(t *testing.T, change func(*wire.Message) []byte) string {
	t.Helper()
	s, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	t.Cleanup(func() { s.Close(); <-done })
	go func() {
		defer close(done)
		for {
			b := make([]byte, 65535)
			n, a, e := s.ReadFrom(b)
			if e != nil {
				return
			}
			m, e := wire.Decode(b[:n])
			if e != nil {
				continue
			}
			m.Flags = 0x8400
			m.Answers = []wire.RR{{Name: m.Questions[0].Name, Type: wire.A, Class: 1, TTL: 60, Data: []byte{127, 0, 0, 1}}}
			raw := change(&m)
			if raw == nil {
				raw, _ = wire.Encode(m)
			}
			s.WriteTo(raw, a)
		}
	}()
	return s.LocalAddr().String()
}

// @id TEST-TRANSPORT-001 @verifies REQ-TRANSPORT-001 REQ-TRANSPORT-002
func TestTEST_TRANSPORT_001(t *testing.T) {
	q := wire.Question{"example.", wire.A, 1}
	s := peer(t, func(m *wire.Message) []byte { return nil })
	m, err := (UDP{time.Second}).Exchange(context.Background(), s, q)
	if err != nil {
		t.Fatal(err)
	}
	if len(m.Answers) != 1 || len(m.Questions) != 1 || m.Questions[0] != q {
		t.Fatal("datagram roundtrip failed")
	}
}

// @id TEST-TRANSPORT-002 @verifies REQ-TRANSPORT-003 REQ-TRANSPORT-004
func TestTEST_TRANSPORT_002(t *testing.T) {
	for _, mutate := range []func(*wire.Message){func(m *wire.Message) { m.ID++ }, func(m *wire.Message) { m.Flags = 0 }, func(m *wire.Message) { m.Questions[0].Name = "wrong." }} {
		s := peer(t, func(m *wire.Message) []byte { mutate(m); return nil })
		if _, err := (UDP{time.Second}).Exchange(context.Background(), s, wire.Question{"example.", wire.A, 1}); err == nil {
			t.Fatal("mismatched response accepted")
		}
	}
}

// @id TEST-TRANSPORT-003 @verifies REQ-TRANSPORT-005 REQ-TRANSPORT-006
func TestTEST_TRANSPORT_003(t *testing.T) {
	s := peer(t, func(m *wire.Message) []byte { return []byte{1} })
	if _, err := (UDP{time.Second}).Exchange(context.Background(), s, wire.Question{"example.", wire.A, 1}); err == nil {
		t.Fatal("malformed accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	if _, err := (UDP{time.Second}).Exchange(ctx, s, wire.Question{"example.", wire.A, 1}); err == nil {
		t.Fatal("cancelled exchange accepted")
	}
	if time.Since(start) > 200*time.Millisecond {
		t.Fatal("cancellation slow")
	}
}

// @id TEST-TRANSPORT-004 @verifies REQ-TRANSPORT-007 REQ-TRANSPORT-008
func TestTEST_TRANSPORT_004(t *testing.T) {
	s := peer(t, func(m *wire.Message) []byte { m.Flags |= 0x200; return nil })
	if _, err := (UDP{time.Second}).Exchange(context.Background(), s, wire.Question{"example.", wire.A, 1}); err == nil {
		t.Fatal("truncated response accepted")
	}
	s = peer(t, func(m *wire.Message) []byte { return nil })
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			m, err := (UDP{time.Second}).Exchange(context.Background(), s, wire.Question{"example.", wire.A, 1})
			if err != nil || len(m.Answers) != 1 {
				t.Error("concurrent exchange", err)
			}
		}()
	}
	wg.Wait()
}
