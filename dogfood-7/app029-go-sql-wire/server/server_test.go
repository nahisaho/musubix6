package server

import (
	"bytes"
	"encoding/binary"
	"io"
	"net"
	"sync"
	"testing"
	"time"

	"example.com/sqlwire/internal/auth"
	"example.com/sqlwire/internal/wire"
)

type chunkConn struct{ net.Conn }

func (c chunkConn) Write(b []byte) (int, error) {
	if len(b) > 3 {
		b = b[:3]
	}
	return c.Conn.Write(b)
}

func startupBody(protocol uint32, body string) []byte {
	b := make([]byte, 8+len(body))
	binary.BigEndian.PutUint32(b, uint32(len(b)))
	binary.BigEndian.PutUint32(b[4:], protocol)
	copy(b[8:], body)
	return b
}
func open(t *testing.T, ssl bool) (net.Conn, <-chan error) {
	t.Helper()
	s, c := net.Pipe()
	c.SetDeadline(time.Now().Add(3 * time.Second))
	s.SetDeadline(time.Now().Add(3 * time.Second))
	done := make(chan error, 1)
	go func() { done <- Serve(chunkConn{s}, auth.NewPolicy([]string{"demo"})) }()
	t.Cleanup(func() { c.Close() })
	if ssl {
		if _, err := c.Write(startupBody(80877103, "")); err != nil {
			t.Fatal(err)
		}
		var b [1]byte
		if _, err := io.ReadFull(c, b[:]); err != nil || b[0] != 'N' {
			t.Fatalf("SSL response %x %v", b, err)
		}
	}
	if _, err := c.Write(startupBody(196608, "user\x00demo\x00\x00")); err != nil {
		t.Fatal(err)
	}
	frames := untilReady(t, c)
	if len(frames) < 2 || frames[0].Tag != 'R' || !bytes.Equal(frames[0].Body, []byte{0, 0, 0, 0}) || string(frames[len(frames)-1].Body) != "I" {
		t.Fatalf("handshake %+v", frames)
	}
	return c, done
}
func untilReady(t *testing.T, c net.Conn) []wire.Frame {
	t.Helper()
	var got []wire.Frame
	for {
		f, err := wire.Read(c, wire.Limit)
		if err != nil {
			t.Fatal(err)
		}
		got = append(got, f)
		if f.Tag == 'Z' {
			return got
		}
		if len(got) > 50 {
			t.Fatal("unbounded response")
		}
	}
}
func round(t *testing.T, c net.Conn, frames ...wire.Frame) []wire.Frame {
	t.Helper()
	var b bytes.Buffer
	for _, f := range frames {
		if err := wire.Write(&b, f.Tag, f.Body); err != nil {
			t.Fatal(err)
		}
	}
	done := make(chan error, 1)
	go func() { _, err := c.Write(b.Bytes()); done <- err }()
	got := untilReady(t, c)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	return got
}
func simple(t *testing.T, c net.Conn, sql string) []wire.Frame {
	t.Helper()
	return round(t, c, wire.Frame{Tag: 'Q', Body: append([]byte(sql), 0)})
}
func tags(frames []wire.Frame) string {
	b := make([]byte, len(frames))
	for i, f := range frames {
		b[i] = f.Tag
	}
	return string(b)
}
func parse(name, sql string) wire.Frame {
	return wire.Frame{Tag: 'P', Body: append([]byte(name+"\x00"+sql+"\x00"), 0, 0)}
}
func bind(portal, stmt string) wire.Frame {
	return wire.Frame{Tag: 'B', Body: append([]byte(portal+"\x00"+stmt+"\x00"), 0, 0, 0, 0, 0, 0)}
}
func execute(portal string, max uint32) wire.Frame {
	b := append([]byte(portal), 0)
	n := make([]byte, 4)
	binary.BigEndian.PutUint32(n, max)
	return wire.Frame{Tag: 'E', Body: append(b, n...)}
}
func syncFrame() wire.Frame { return wire.Frame{Tag: 'S'} }
func firstValue(t *testing.T, f wire.Frame) string {
	t.Helper()
	c := wire.Cursor{Body: f.Body}
	n, e := c.U16()
	if e != nil || n == 0 {
		t.Fatal("row columns")
	}
	length, e := c.U32()
	if e != nil {
		t.Fatal(e)
	}
	b, e := c.Bytes(int(length))
	if e != nil {
		t.Fatal(e)
	}
	return string(b)
}
func terminate(t *testing.T, c net.Conn, done <-chan error) {
	t.Helper()
	if err := wire.Write(c, 'X', nil); err != nil {
		t.Fatal(err)
	}
	if _, err := wire.Read(c, wire.Limit); err != io.EOF {
		t.Fatalf("terminate: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

// @id TEST-SESSION-001 @verifies REQ-SESSION-001 REQ-SESSION-002
func TestTEST_SESSION_001(t *testing.T) {
	for _, ssl := range []bool{false, true} {
		c, done := open(t, ssl)
		terminate(t, c, done)
	}
}

// @id TEST-SESSION-002 @verifies REQ-SESSION-003 REQ-SESSION-004
func TestTEST_SESSION_002(t *testing.T) {
	c, done := open(t, false)
	f := simple(t, c, "SELECT 42, NULL")
	if tags(f) != "TDCZ" || firstValue(t, f[1]) != "42" {
		t.Fatalf("select %s", tags(f))
	}
	f = simple(t, c, "BEGIN")
	if tags(f) != "CZ" || string(f[1].Body) != "T" {
		t.Fatal("begin state")
	}
	f = simple(t, c, "ROLLBACK")
	if string(f[len(f)-1].Body) != "I" {
		t.Fatal("rollback state")
	}
	terminate(t, c, done)
}

// @id TEST-SESSION-003 @verifies REQ-SESSION-005 REQ-SESSION-006
func TestTEST_SESSION_003(t *testing.T) {
	c, done := open(t, false)
	f := round(t, c, parse("s", "SELECT generate_series(1,3)"), bind("p", "s"), execute("p", 1), syncFrame())
	if tags(f) != "12DsZ" || firstValue(t, f[2]) != "1" {
		t.Fatalf("extended %s", tags(f))
	}
	simple(t, c, "BEGIN")
	simple(t, c, "ROLLBACK")
	f = round(t, c, execute("p", 0), syncFrame())
	if tags(f) != "DDCZ" || firstValue(t, f[0]) != "2" || firstValue(t, f[1]) != "3" {
		t.Fatal("resume")
	}
	f = round(t, c, wire.Frame{Tag: 'D', Body: []byte("Ss\x00")}, wire.Frame{Tag: 'C', Body: []byte("Pp\x00")}, syncFrame())
	if tags(f) != "tT3Z" {
		t.Fatalf("describe close %s", tags(f))
	}
	terminate(t, c, done)
}

// @id TEST-SESSION-004 @verifies REQ-SESSION-007 REQ-SESSION-008
func TestTEST_SESSION_004(t *testing.T) {
	c, done := open(t, false)
	simple(t, c, "BEGIN")
	f := round(t, c, parse("s", "invalid"), bind("p", "missing"), syncFrame())
	if tags(f) != "EZ" || string(f[1].Body) != "E" {
		t.Fatalf("recovery %s", tags(f))
	}
	f = simple(t, c, "SELECT 1")
	if tags(f) != "EZ" || !bytes.Contains(f[0].Body, []byte("25P02")) {
		t.Fatal("failed transaction")
	}
	f = simple(t, c, "ROLLBACK")
	if string(f[len(f)-1].Body) != "I" {
		t.Fatal("reset")
	}
	// Terminate must bypass the extended recovery latch.
	if err := wire.Write(c, 'P', parse("bad", "invalid").Body); err != nil {
		t.Fatal(err)
	}
	if f, err := wire.Read(c, wire.Limit); err != nil || f.Tag != 'E' {
		t.Fatal("missing error")
	}
	terminate(t, c, done)
}

// @id TEST-SESSION-005 @verifies REQ-SESSION-009 REQ-SESSION-010
func TestTEST_SESSION_005(t *testing.T) {
	var wg sync.WaitGroup
	for _, value := range []string{"11", "22"} {
		wg.Add(1)
		go func(value string) {
			defer wg.Done()
			t.Run(value, func(t *testing.T) {
				c, done := open(t, false)
				f := round(t, c, parse("s", "SELECT "+value), bind("p", "s"), execute("p", 0), syncFrame())
				if tags(f) != "12DCZ" || firstValue(t, f[2]) != value {
					t.Fatal("isolation")
				}
				terminate(t, c, done)
			})
		}(value)
	}
	wg.Wait()
}

// @id TEST-SESSION-006 @verifies REQ-SESSION-012
func TestTEST_SESSION_006(t *testing.T) {
	c, done := open(t, false)
	invalid := parse("atomic", "SELECT 1")
	invalid.Body = invalid.Body[:len(invalid.Body)-2]
	invalid.Body = append(invalid.Body, 0, 1, 0, 0, 0, 25)
	f := round(t, c, invalid, syncFrame())
	if tags(f) != "EZ" {
		t.Fatalf("expected count error: %s", tags(f))
	}
	f = round(t, c, parse("atomic", "SELECT 2"), bind("p", "atomic"), execute("p", 0), syncFrame())
	if tags(f) != "12DCZ" || firstValue(t, f[2]) != "2" {
		t.Fatalf("failed Parse retained resource: %s", tags(f))
	}
	// An invalid unnamed Parse must preserve the earlier unnamed statement too.
	f = round(t, c, parse("", "SELECT 3"), syncFrame())
	if tags(f) != "1Z" {
		t.Fatal("unnamed prepare")
	}
	invalid = parse("", "SELECT 9")
	invalid.Body = append(invalid.Body[:len(invalid.Body)-2], 0, 1, 0, 0, 0, 25)
	round(t, c, invalid, syncFrame())
	f = round(t, c, bind("", ""), execute("", 0), syncFrame())
	if tags(f) != "2DCZ" || firstValue(t, f[1]) != "3" {
		t.Fatal("failed unnamed replacement was committed")
	}
	terminate(t, c, done)
}

// @id TEST-SESSION-007 @verifies REQ-SESSION-013
func TestTEST_SESSION_007(t *testing.T) {
	c, done := open(t, false)
	round(t, c, parse("existing", "SELECT 1"), syncFrame())
	simple(t, c, "BEGIN")
	simple(t, c, "invalid")
	for _, request := range []wire.Frame{parse("blocked", "SELECT 2"), bind("blocked", "existing")} {
		f := round(t, c, request, syncFrame())
		if tags(f) != "EZ" || !bytes.Contains(f[0].Body, []byte("25P02")) {
			t.Fatalf("aborted resource work accepted: %s", tags(f))
		}
	}
	simple(t, c, "ROLLBACK")
	f := round(t, c, bind("check", "blocked"), syncFrame())
	if tags(f) != "EZ" {
		t.Fatal("failed Parse registered a statement")
	}
	f = round(t, c, execute("blocked", 0), syncFrame())
	if tags(f) != "EZ" {
		t.Fatal("failed Bind registered a portal")
	}
	terminate(t, c, done)
}

// @id TEST-SESSION-008 @verifies REQ-SESSION-014
func TestTEST_SESSION_008(t *testing.T) {
	c, done := open(t, false)
	expressions := bytes.Repeat([]byte("$1,"), 127)
	expressions = append(expressions, []byte("$1")...)
	value := bytes.Repeat([]byte("x"), 10000)
	b := []byte("p\x00s\x00")
	b = append(b, 0, 0, 0, 1)
	b = append(b, u32(uint32(len(value)))...)
	b = append(b, value...)
	b = append(b, 0, 0)
	f := round(t, c, parse("s", "SELECT "+string(expressions)), wire.Frame{Tag: 'B', Body: b}, execute("p", 0), syncFrame())
	if tags(f) != "12EZ" || !bytes.Contains(f[2].Body, []byte("54000")) {
		t.Fatalf("oversized response: %s", tags(f))
	}
	terminate(t, c, done)
}

// @id TEST-SESSION-009 @verifies REQ-SESSION-015
func TestTEST_SESSION_009(t *testing.T) {
	c, done := open(t, false)
	for _, oid := range []uint32{23, 25, 0} {
		p := parse("", "SELECT $1")
		p.Body = append(p.Body[:len(p.Body)-2], 0, 1)
		p.Body = append(p.Body, u32(oid)...)
		f := round(t, c, p, wire.Frame{Tag: 'D', Body: []byte("S\x00")}, syncFrame())
		if oid == 23 {
			if tags(f) != "EZ" || !bytes.Contains(f[0].Body, []byte("0A000")) {
				t.Fatal("non-text OID accepted")
			}
			continue
		}
		if tags(f) != "1tTZ" || !bytes.Equal(f[1].Body, []byte{0, 1, 0, 0, 0, 25}) {
			t.Fatal("parameter description mismatch")
		}
	}
	terminate(t, c, done)
}
