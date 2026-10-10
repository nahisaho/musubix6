package wire

import (
	"dogfood.local/dns/internal/name"
	"encoding/binary"
	"errors"
	"strings"
)

const (
	A       uint16 = 1
	NS      uint16 = 2
	CNAME   uint16 = 5
	SOAType uint16 = 6
	AAAA    uint16 = 28
)

type Question struct {
	Name        string
	Type, Class uint16
}
type SOA struct {
	MName, RName                            string
	Serial, Refresh, Retry, Expire, Minimum uint32
}
type RR struct {
	Name        string
	Type, Class uint16
	TTL         uint32
	Data        []byte
	Target      string
	SOA         *SOA
}
type Message struct {
	ID, Flags                      uint16
	Questions                      []Question
	Answers, Authority, Additional []RR
}

type encoder struct {
	b      []byte
	suffix map[string]int
}

func (e *encoder) u16(n uint16) { e.b = binary.BigEndian.AppendUint16(e.b, n) }
func (e *encoder) u32(n uint32) { e.b = binary.BigEndian.AppendUint32(e.b, n) }
func (e *encoder) domain(s string) error {
	n, err := name.Canonical(s)
	if err != nil {
		return err
	}
	if n == "." {
		e.b = append(e.b, 0)
		return nil
	}
	labels := strings.Split(strings.TrimSuffix(n, "."), ".")
	for i, label := range labels {
		suffix := strings.Join(labels[i:], ".") + "."
		if offset, ok := e.suffix[suffix]; ok {
			e.u16(0xc000 | uint16(offset))
			return nil
		}
		if len(e.b) < 0x4000 {
			e.suffix[suffix] = len(e.b)
		}
		e.b = append(e.b, byte(len(label)))
		e.b = append(e.b, label...)
	}
	e.b = append(e.b, 0)
	return nil
}
func (e *encoder) record(r RR) error {
	if err := e.domain(r.Name); err != nil {
		return err
	}
	e.u16(r.Type)
	e.u16(r.Class)
	e.u32(r.TTL)
	pos := len(e.b)
	e.u16(0)
	start := len(e.b)
	switch r.Type {
	case NS, CNAME:
		if err := e.domain(r.Target); err != nil {
			return err
		}
	case SOAType:
		if r.SOA == nil {
			return errors.New("missing SOA")
		}
		if err := e.domain(r.SOA.MName); err != nil {
			return err
		}
		if err := e.domain(r.SOA.RName); err != nil {
			return err
		}
		for _, v := range []uint32{r.SOA.Serial, r.SOA.Refresh, r.SOA.Retry, r.SOA.Expire, r.SOA.Minimum} {
			e.u32(v)
		}
	default:
		e.b = append(e.b, r.Data...)
	}
	if len(e.b)-start > 65535 {
		return errors.New("RDATA too long")
	}
	binary.BigEndian.PutUint16(e.b[pos:], uint16(len(e.b)-start))
	return nil
}

// @id CODE-WIRE-001 @implements REQ-WIRE-001 REQ-WIRE-002 REQ-WIRE-003 REQ-WIRE-004 REQ-WIRE-005 REQ-WIRE-006 REQ-WIRE-007 REQ-WIRE-008
func Encode(m Message) ([]byte, error) {
	e := encoder{b: make([]byte, 0, 512), suffix: map[string]int{}}
	e.u16(m.ID)
	e.u16(m.Flags)
	for _, n := range []int{len(m.Questions), len(m.Answers), len(m.Authority), len(m.Additional)} {
		if n > 65535 {
			return nil, errors.New("too many records")
		}
		e.u16(uint16(n))
	}
	for _, q := range m.Questions {
		if err := e.domain(q.Name); err != nil {
			return nil, err
		}
		e.u16(q.Type)
		e.u16(q.Class)
	}
	for _, section := range [][]RR{m.Answers, m.Authority, m.Additional} {
		for _, r := range section {
			if err := e.record(r); err != nil {
				return nil, err
			}
		}
	}
	if len(e.b) > 65535 {
		return nil, errors.New("packet too long")
	}
	return e.b, nil
}

func domain(b []byte, start int) (string, int, error) {
	pos, next := start, -1
	seen := map[int]bool{}
	labels := []string{}
	size := 1
	for {
		if pos < 0 || pos >= len(b) || seen[pos] {
			return "", 0, errors.New("invalid name pointer")
		}
		seen[pos] = true
		v := int(b[pos])
		pos++
		if v&0xc0 == 0xc0 {
			if pos >= len(b) {
				return "", 0, errors.New("truncated pointer")
			}
			if next < 0 {
				next = pos + 1
			}
			pos = (v&63)<<8 | int(b[pos])
			continue
		}
		if v&0xc0 != 0 {
			return "", 0, errors.New("invalid label encoding")
		}
		if v == 0 {
			if next < 0 {
				next = pos
			}
			s := "."
			if len(labels) > 0 {
				s = strings.Join(labels, ".") + "."
			}
			n, err := name.Canonical(s)
			return n, next, err
		}
		if pos+v > len(b) {
			return "", 0, errors.New("truncated label")
		}
		label := string(b[pos : pos+v])
		if strings.Contains(label, ".") {
			return "", 0, errors.New("embedded label dot")
		}
		size += v + 1
		if size > 255 {
			return "", 0, errors.New("name too long")
		}
		labels = append(labels, label)
		pos += v
	}
}

type decoder struct {
	b []byte
	p int
}

func (d *decoder) take(n int) ([]byte, error) {
	if n < 0 || d.p+n > len(d.b) {
		return nil, errors.New("truncated packet")
	}
	v := d.b[d.p : d.p+n]
	d.p += n
	return v, nil
}
func (d *decoder) domain() (string, error) {
	s, next, err := domain(d.b, d.p)
	if err == nil {
		d.p = next
	}
	return s, err
}
func (d *decoder) record() (RR, error) {
	var r RR
	var err error
	r.Name, err = d.domain()
	if err != nil {
		return r, err
	}
	h, err := d.take(10)
	if err != nil {
		return r, err
	}
	r.Type = binary.BigEndian.Uint16(h)
	r.Class = binary.BigEndian.Uint16(h[2:])
	r.TTL = binary.BigEndian.Uint32(h[4:])
	end := d.p + int(binary.BigEndian.Uint16(h[8:]))
	if end > len(d.b) {
		return r, errors.New("truncated RDATA")
	}
	switch r.Type {
	case NS, CNAME:
		r.Target, err = d.domain()
	case SOAType:
		s := &SOA{}
		s.MName, err = d.domain()
		if err != nil {
			return r, err
		}
		s.RName, err = d.domain()
		if err != nil {
			return r, err
		}
		v, e := d.take(20)
		if e != nil {
			return r, e
		}
		s.Serial = binary.BigEndian.Uint32(v)
		s.Refresh = binary.BigEndian.Uint32(v[4:])
		s.Retry = binary.BigEndian.Uint32(v[8:])
		s.Expire = binary.BigEndian.Uint32(v[12:])
		s.Minimum = binary.BigEndian.Uint32(v[16:])
		r.SOA = s
	default:
		r.Data = append([]byte(nil), d.b[d.p:end]...)
		d.p = end
	}
	if err != nil {
		return r, err
	}
	if d.p != end {
		return r, errors.New("RDATA length mismatch")
	}
	return r, nil
}
func Decode(b []byte) (Message, error) {
	var m Message
	d := decoder{b: b}
	h, err := d.take(12)
	if err != nil {
		return m, err
	}
	m.ID = binary.BigEndian.Uint16(h)
	m.Flags = binary.BigEndian.Uint16(h[2:])
	for i := 0; i < int(binary.BigEndian.Uint16(h[4:])); i++ {
		n, err := d.domain()
		if err != nil {
			return m, err
		}
		v, err := d.take(4)
		if err != nil {
			return m, err
		}
		m.Questions = append(m.Questions, Question{n, binary.BigEndian.Uint16(v), binary.BigEndian.Uint16(v[2:])})
	}
	for i, section := range []*[]RR{&m.Answers, &m.Authority, &m.Additional} {
		for j := 0; j < int(binary.BigEndian.Uint16(h[6+i*2:])); j++ {
			r, err := d.record()
			if err != nil {
				return m, err
			}
			*section = append(*section, r)
		}
	}
	if d.p != len(b) {
		return m, errors.New("trailing packet bytes")
	}
	return m, nil
}
