package wire

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
)

const Limit uint32 = 1 << 20

var ErrPayload = errors.New("08P01: malformed payload")

type Frame struct {
	Tag  byte
	Body []byte
}

// @id CODE-WIRE-001 @implements REQ-WIRE-001 REQ-WIRE-002 REQ-WIRE-003 REQ-WIRE-004
func Read(r io.Reader, limit uint32) (Frame, error) {
	var header [5]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return Frame{}, err
	}
	n := binary.BigEndian.Uint32(header[1:])
	if n < 4 || n > limit {
		return Frame{}, ErrPayload
	}
	b := make([]byte, int(n)-4)
	_, err := io.ReadFull(r, b)
	return Frame{header[0], b}, err
}

// @id CODE-WIRE-002 @implements REQ-WIRE-005 REQ-WIRE-006
func Write(w io.Writer, tag byte, body []byte) error {
	if uint64(len(body))+4 > uint64(^uint32(0)) {
		return ErrPayload
	}
	b := make([]byte, 5+len(body))
	b[0] = tag
	binary.BigEndian.PutUint32(b[1:], uint32(4+len(body)))
	copy(b[5:], body)
	for len(b) > 0 {
		n, err := w.Write(b)
		if err != nil {
			return err
		}
		if n <= 0 || n > len(b) {
			return io.ErrShortWrite
		}
		b = b[n:]
	}
	return nil
}

// @id CODE-WIRE-003 @implements REQ-WIRE-007 REQ-WIRE-008
func Startup(r io.Reader, limit uint32) (uint32, []byte, error) {
	var h [4]byte
	if _, err := io.ReadFull(r, h[:]); err != nil {
		return 0, nil, err
	}
	n := binary.BigEndian.Uint32(h[:])
	if n < 8 || n > limit {
		return 0, nil, ErrPayload
	}
	b := make([]byte, int(n)-4)
	if _, err := io.ReadFull(r, b); err != nil {
		return 0, nil, err
	}
	return binary.BigEndian.Uint32(b), b[4:], nil
}

type Cursor struct {
	Body []byte
	Pos  int
}

// @id CODE-WIRE-004 @implements REQ-WIRE-009 REQ-WIRE-010
func (c *Cursor) Bytes(n int) ([]byte, error) {
	if n < 0 || c.Pos < 0 || c.Pos > len(c.Body) || n > len(c.Body)-c.Pos {
		return nil, ErrPayload
	}
	b := c.Body[c.Pos : c.Pos+n]
	c.Pos += n
	return b, nil
}
func (c *Cursor) U16() (uint16, error) {
	b, err := c.Bytes(2)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint16(b), nil
}
func (c *Cursor) U32() (uint32, error) {
	b, err := c.Bytes(4)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(b), nil
}
func (c *Cursor) String() (string, error) {
	if c.Pos < 0 || c.Pos > len(c.Body) {
		return "", ErrPayload
	}
	n := bytes.IndexByte(c.Body[c.Pos:], 0)
	if n < 0 {
		return "", ErrPayload
	}
	b, err := c.Bytes(n + 1)
	return string(b[:n]), err
}
func (c *Cursor) Done() bool { return c.Pos == len(c.Body) }
