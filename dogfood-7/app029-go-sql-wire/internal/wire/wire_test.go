package wire

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"testing"
)

type byteReader struct{ io.Reader }

func (r byteReader) Read(b []byte) (int, error) { return r.Reader.Read(b[:1]) }

type shortWriter struct{ bytes.Buffer }

func (w *shortWriter) Write(b []byte) (int, error) { return w.Buffer.Write(b[:1]) }

type zeroWriter struct{}

func (zeroWriter) Write([]byte) (int, error) { return 0, nil }

// @id TEST-WIRE-001 @verifies REQ-WIRE-001 REQ-WIRE-002
func TestTEST_WIRE_001(t *testing.T) {
	b := []byte{'Q', 0, 0, 0, 7, 'x', 'y', 0}
	for _, reader := range []io.Reader{bytes.NewReader(b), byteReader{bytes.NewReader(b)}} {
		t.Run("fragmented", func(t *testing.T) {
			got, err := Read(reader, 1024)
			if err != nil || got.Tag != 'Q' || !bytes.Equal(got.Body, []byte{'x', 'y', 0}) {
				t.Fatalf("roundtrip: %+v %v", got, err)
			}
		})
	}
}

// @id TEST-WIRE-002 @verifies REQ-WIRE-003 REQ-WIRE-004
func TestTEST_WIRE_002(t *testing.T) {
	for _, n := range []uint32{0, 3, 1025, ^uint32(0)} {
		b := []byte{'Q', 0, 0, 0, 0}
		binary.BigEndian.PutUint32(b[1:], n)
		if _, err := Read(bytes.NewReader(b), 1024); err == nil {
			t.Fatalf("length %d accepted", n)
		}
	}
}

// @id TEST-WIRE-003 @verifies REQ-WIRE-005 REQ-WIRE-006
func TestTEST_WIRE_003(t *testing.T) {
	w := &shortWriter{}
	if err := Write(w, 'Z', []byte{'I'}); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(w.Bytes(), []byte{'Z', 0, 0, 0, 5, 'I'}) {
		t.Fatalf("encoding: %x", w.Bytes())
	}
	if !errors.Is(Write(zeroWriter{}, 'Z', nil), io.ErrShortWrite) {
		t.Fatal("zero write accepted")
	}
}

// @id TEST-WIRE-004 @verifies REQ-WIRE-007 REQ-WIRE-008
func TestTEST_WIRE_004(t *testing.T) {
	b := []byte{0, 0, 0, 9, 0, 3, 0, 0, 0}
	p, body, err := Startup(byteReader{bytes.NewReader(b)}, 1024)
	if p != 196608 || !bytes.Equal(body, []byte{0}) || err != nil {
		t.Fatalf("startup: %d %x %v", p, body, err)
	}
	if _, _, err := Startup(bytes.NewReader(b[:8]), 1024); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("truncated: %v", err)
	}
}

// @id TEST-WIRE-005 @verifies REQ-WIRE-009 REQ-WIRE-010
func TestTEST_WIRE_005(t *testing.T) {
	c := Cursor{Body: []byte{0, 2, 0, 0, 0, 7, 'o', 'k', 0}}
	n, e1 := c.U16()
	m, e2 := c.U32()
	s, e3 := c.String()
	if n != 2 || m != 7 || s != "ok" || e1 != nil || e2 != nil || e3 != nil || !c.Done() {
		t.Fatal("cursor decode")
	}
	if _, err := c.U16(); err == nil {
		t.Fatal("cursor overrun")
	}
	c = Cursor{Body: []byte("bad")}
	if _, err := c.String(); err == nil {
		t.Fatal("unterminated")
	}
}
