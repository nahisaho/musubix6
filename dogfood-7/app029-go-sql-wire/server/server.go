package server

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"

	"example.com/sqlwire/internal/auth"
	"example.com/sqlwire/internal/query"
	"example.com/sqlwire/internal/tx"
	"example.com/sqlwire/internal/wire"
)

type session struct {
	conn        net.Conn
	engine      *query.Engine
	transaction *tx.Machine
	recovering  bool
}

func u16(n uint16) []byte                           { b := make([]byte, 2); binary.BigEndian.PutUint16(b, n); return b }
func u32(n uint32) []byte                           { b := make([]byte, 4); binary.BigEndian.PutUint32(b, n); return b }
func text(s string) []byte                          { return append([]byte(s), 0) }
func (s *session) send(tag byte, body []byte) error { return wire.Write(s.conn, tag, body) }
func (s *session) ready() error                     { return s.send('Z', []byte{s.transaction.State}) }
func (s *session) failure(err error) error {
	code := "XX000"
	message := err.Error()
	var qe *query.Error
	var ae *auth.Error
	if errors.As(err, &qe) {
		code = qe.Code
		message = qe.Message
	} else if errors.As(err, &ae) {
		code = ae.Code
		message = ae.Message
	} else if len(message) > 7 && message[5:7] == ": " {
		code = message[:5]
		message = message[7:]
	}
	b := append([]byte{'S'}, text("ERROR")...)
	b = append(b, 'C')
	b = append(b, text(code)...)
	b = append(b, 'M')
	b = append(b, text(message)...)
	b = append(b, 0)
	return s.send('E', b)
}

// @id CODE-SESSION-001 @implements REQ-SESSION-001 REQ-SESSION-002 REQ-SESSION-009 REQ-SESSION-010
func Serve(conn net.Conn, policy *auth.Policy) error {
	defer conn.Close()
	s := &session{conn: conn, engine: query.New(), transaction: tx.New()}
	protocol, body, err := wire.Startup(conn, wire.Limit)
	if err != nil {
		return err
	}
	if auth.IsSSL(protocol) {
		if len(body) != 0 {
			return wire.ErrPayload
		}
		if _, err = conn.Write([]byte{'N'}); err != nil {
			return err
		}
		protocol, body, err = wire.Startup(conn, wire.Limit)
		if err != nil {
			return err
		}
	}
	if _, err = auth.Authenticate(protocol, body, policy); err != nil {
		if sendErr := s.failure(err); sendErr != nil {
			return sendErr
		}
		return err
	}
	if err = s.send('R', u32(0)); err != nil {
		return err
	}
	for _, pair := range [][2]string{{"server_version", "15.0-wire-lite"}, {"client_encoding", "UTF8"}} {
		if err = s.send('S', append(text(pair[0]), text(pair[1])...)); err != nil {
			return err
		}
	}
	if err = s.send('K', append(u32(uint32(os.Getpid())), u32(0)...)); err != nil {
		return err
	}
	if err = s.ready(); err != nil {
		return err
	}
	for {
		frame, err := wire.Read(conn, wire.Limit)
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		if frame.Tag == 'X' {
			if len(frame.Body) != 0 {
				return wire.ErrPayload
			}
			return nil
		}
		if s.recovering && frame.Tag != 'S' {
			continue
		}
		err = s.handle(frame)
		if err == nil {
			continue
		}
		s.transaction.Apply("FAIL")
		if sendErr := s.failure(err); sendErr != nil {
			return sendErr
		}
		if frame.Tag == 'Q' {
			if err = s.ready(); err != nil {
				return err
			}
		} else {
			s.recovering = true
		}
	}
}

func (s *session) description(st *query.Statement) error {
	b := u16(uint16(len(st.Columns)))
	for _, name := range st.Columns {
		b = append(b, text(name)...)
		b = append(b, u32(0)...)
		b = append(b, u16(0)...)
		b = append(b, u32(25)...)
		b = append(b, u16(65535)...)
		b = append(b, u32(^uint32(0))...)
		b = append(b, u16(0)...)
	}
	return s.send('T', b)
}

// @id CODE-SESSION-004 @implements REQ-SESSION-014
func (s *session) rows(p *query.Portal, max uint32) error {
	rows, done, err := p.Execute(max)
	if err != nil {
		return err
	}
	for _, row := range rows {
		length := uint64(6 + 4*len(row))
		for _, value := range row {
			if value != nil {
				length += uint64(len(*value))
			}
		}
		if length > uint64(wire.Limit) {
			return &query.Error{Code: "54000", Message: "result row exceeds frame limit"}
		}
		b := u16(uint16(len(row)))
		for _, v := range row {
			if v == nil {
				b = append(b, u32(^uint32(0))...)
			} else {
				b = append(b, u32(uint32(len(*v)))...)
				b = append(b, []byte(*v)...)
			}
		}
		if err := s.send('D', b); err != nil {
			return err
		}
	}
	if !done {
		return s.send('s', nil)
	}
	return s.send('C', text(fmt.Sprintf("SELECT %d", p.Count())))
}

// @id CODE-SESSION-002 @implements REQ-SESSION-003 REQ-SESSION-004
func (s *session) simple(body []byte) error {
	c := wire.Cursor{Body: body}
	sql, err := c.String()
	if err != nil || !c.Done() {
		return wire.ErrPayload
	}
	command := strings.ToUpper(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(sql), ";")))
	if command == "" {
		if err := s.send('I', nil); err != nil {
			return err
		}
		return s.ready()
	}
	if command == "BEGIN" || command == "COMMIT" || command == "ROLLBACK" {
		tag, err := s.transaction.Apply(command)
		if err != nil {
			return err
		}
		if err = s.send('C', text(tag)); err != nil {
			return err
		}
		return s.ready()
	}
	if _, err = s.transaction.Apply("QUERY"); err != nil {
		return err
	}
	st, err := s.engine.Prepare("", sql)
	if err != nil {
		return err
	}
	p, err := s.engine.Bind("", "", nil)
	if err != nil {
		return err
	}
	if err = s.description(st); err != nil {
		return err
	}
	if err = s.rows(p, 0); err != nil {
		return err
	}
	return s.ready()
}

// @id CODE-SESSION-003 @implements REQ-SESSION-005 REQ-SESSION-006 REQ-SESSION-007 REQ-SESSION-008 REQ-SESSION-012 REQ-SESSION-013 REQ-SESSION-015
func (s *session) handle(f wire.Frame) error {
	c := wire.Cursor{Body: f.Body}
	switch f.Tag {
	case 'Q':
		return s.simple(f.Body)
	case 'S':
		if !c.Done() {
			return wire.ErrPayload
		}
		s.recovering = false
		return s.ready()
	case 'H':
		if !c.Done() {
			return wire.ErrPayload
		}
		return nil
	case 'P':
		if _, err := s.transaction.Apply("QUERY"); err != nil {
			return err
		}
		name, err := c.String()
		if err != nil {
			return err
		}
		sql, err := c.String()
		if err != nil {
			return err
		}
		n, err := c.U16()
		if err != nil || n > 128 {
			return wire.ErrPayload
		}
		for i := 0; i < int(n); i++ {
			oid, err := c.U32()
			if err != nil {
				return err
			}
			if oid != 0 && oid != 25 {
				return &query.Error{Code: "0A000", Message: "parameter type unsupported"}
			}
		}
		if !c.Done() {
			return wire.ErrPayload
		}
		preview, err := query.New().Prepare("", sql)
		if err != nil {
			return err
		}
		if n != 0 && int(n) != preview.Params {
			return wire.ErrPayload
		}
		if _, err := s.engine.Prepare(name, sql); err != nil {
			return err
		}
		return s.send('1', nil)
	case 'B':
		if _, err := s.transaction.Apply("QUERY"); err != nil {
			return err
		}
		portal, err := c.String()
		if err != nil {
			return err
		}
		statement, err := c.String()
		if err != nil {
			return err
		}
		count, err := c.U16()
		if err != nil || count > 128 {
			return wire.ErrPayload
		}
		for i := 0; i < int(count); i++ {
			format, err := c.U16()
			if err != nil {
				return err
			}
			if format != 0 {
				return &query.Error{Code: "0A000", Message: "binary parameters unsupported"}
			}
		}
		n, err := c.U16()
		if err != nil || n > 128 || count > 1 && count != n {
			return wire.ErrPayload
		}
		args := make([]*string, int(n))
		for i := range args {
			length, err := c.U32()
			if err != nil {
				return err
			}
			if length == ^uint32(0) {
				continue
			}
			if length > wire.Limit {
				return wire.ErrPayload
			}
			b, err := c.Bytes(int(length))
			if err != nil {
				return err
			}
			v := string(b)
			args[i] = &v
		}
		formats, err := c.U16()
		if err != nil || formats > 128 {
			return wire.ErrPayload
		}
		for i := 0; i < int(formats); i++ {
			format, err := c.U16()
			if err != nil {
				return err
			}
			if format != 0 {
				return &query.Error{Code: "0A000", Message: "binary results unsupported"}
			}
		}
		if !c.Done() {
			return wire.ErrPayload
		}
		st, err := s.engine.Statement(statement)
		if err != nil {
			return err
		}
		if formats > 1 && int(formats) != len(st.Columns) {
			return wire.ErrPayload
		}
		if _, err := s.engine.Bind(portal, statement, args); err != nil {
			return err
		}
		return s.send('2', nil)
	case 'E':
		name, err := c.String()
		if err != nil {
			return err
		}
		max, err := c.U32()
		if err != nil || !c.Done() {
			return wire.ErrPayload
		}
		if _, err = s.transaction.Apply("QUERY"); err != nil {
			return err
		}
		p, err := s.engine.Portal(name)
		if err != nil {
			return err
		}
		return s.rows(p, max)
	case 'D', 'C':
		b, err := c.Bytes(1)
		if err != nil {
			return err
		}
		kind := b[0]
		name, err := c.String()
		if err != nil || !c.Done() {
			return wire.ErrPayload
		}
		if f.Tag == 'C' {
			if err := s.engine.Close(kind, name); err != nil {
				return err
			}
			return s.send('3', nil)
		}
		if kind == 'P' {
			p, err := s.engine.Portal(name)
			if err != nil {
				return err
			}
			return s.description(p.Statement)
		}
		if kind != 'S' {
			return wire.ErrPayload
		}
		st, err := s.engine.Statement(name)
		if err != nil {
			return err
		}
		body := u16(uint16(st.Params))
		for i := 0; i < st.Params; i++ {
			body = append(body, u32(25)...)
		}
		if err = s.send('t', body); err != nil {
			return err
		}
		return s.description(st)
	default:
		return wire.ErrPayload
	}
}
