package transport

import (
	"context"
	"crypto/rand"
	"dogfood.local/dns/internal/name"
	"dogfood.local/dns/wire"
	"encoding/binary"
	"errors"
	"net"
	"time"
)

type UDP struct{ Timeout time.Duration }

// @id CODE-TRANSPORT-001 @implements REQ-TRANSPORT-001 REQ-TRANSPORT-002 REQ-TRANSPORT-003 REQ-TRANSPORT-004 REQ-TRANSPORT-005 REQ-TRANSPORT-006 REQ-TRANSPORT-007 REQ-TRANSPORT-008
func (u UDP) Exchange(ctx context.Context, server string, q wire.Question) (wire.Message, error) {
	var empty wire.Message
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	n, err := name.Canonical(q.Name)
	if err != nil {
		return empty, err
	}
	q.Name = n
	var idBytes [2]byte
	if _, err := rand.Read(idBytes[:]); err != nil {
		return empty, err
	}
	id := binary.BigEndian.Uint16(idBytes[:])
	b, err := wire.Encode(wire.Message{ID: id, Questions: []wire.Question{q}})
	if err != nil {
		return empty, err
	}
	conn, err := (&net.Dialer{}).DialContext(ctx, "udp", server)
	if err != nil {
		return empty, err
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	timeout := u.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	deadline := time.Now().Add(timeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	if err := conn.SetDeadline(deadline); err != nil {
		return empty, err
	}
	if _, err = conn.Write(b); err != nil {
		return empty, err
	}
	buf := make([]byte, 65535)
	size, err := conn.Read(buf)
	if err != nil {
		if ctx.Err() != nil {
			return empty, ctx.Err()
		}
		return empty, err
	}
	m, err := wire.Decode(buf[:size])
	if err != nil {
		return empty, err
	}
	if m.ID != id || m.Flags&0x8000 == 0 || len(m.Questions) != 1 || m.Questions[0] != q {
		return empty, errors.New("response transaction mismatch")
	}
	if m.Flags&0x200 != 0 {
		return empty, errors.New("truncated DNS response")
	}
	return m, nil
}
