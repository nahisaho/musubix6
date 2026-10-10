package ingest

import (
	"errors"
	"sort"
	"strconv"
	"strings"

	"example.com/metrics/contract"
)

var (
	ErrFormat    = errors.New("ErrFormat")
	ErrName      = errors.New("ErrName")
	ErrLabels    = errors.New("ErrLabels")
	ErrValue     = errors.New("ErrValue")
	ErrTimestamp = errors.New("ErrTimestamp")
	ErrTooLong   = errors.New("ErrTooLong")
	ErrSkew      = errors.New("ErrSkew")
	ErrCapacity  = errors.New("ErrCapacity")
)

type Label struct{ K, V string }

type Point struct {
	Name   string
	Labels []Label
	Value  uint64
	TS     int64
}

type LineError struct {
	Line int
	Err  error
}

func isAlpha(c byte) bool { return c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') }
func isDigit(c byte) bool { return c >= '0' && c <= '9' }

func validIdent(s string, dots bool) bool {
	if s == "" || !isAlpha(s[0]) {
		return false
	}
	for i := 1; i < len(s); i++ {
		c := s[i]
		if !isAlpha(c) && !isDigit(c) && !(dots && c == '.') {
			return false
		}
	}
	return true
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if !isDigit(s[i]) {
			return false
		}
	}
	return true
}

// parseLabels reads `k=v,...}` (the text after '{') and returns the labels plus the text after '}'.
func parseLabels(s string) ([]Label, string, error) {
	var out []Label
	if strings.HasPrefix(s, "}") {
		return out, s[1:], nil
	}
	i := 0
	for {
		start := i
		for i < len(s) && s[i] != '=' && s[i] != ',' && s[i] != '}' {
			i++
		}
		if i >= len(s) || s[i] != '=' {
			if i < len(s) && s[i] == '}' && start == i && len(out) > 0 {
				return nil, "", ErrLabels
			}
			return nil, "", ErrFormat
		}
		key := s[start:i]
		i++
		var val []byte
		for {
			if i >= len(s) {
				return nil, "", ErrFormat
			}
			c := s[i]
			if c == '\\' {
				if i+1 >= len(s) || !strings.ContainsRune(`\,}=`, rune(s[i+1])) {
					return nil, "", ErrFormat
				}
				val = append(val, s[i+1])
				i += 2
				continue
			}
			if c == ',' || c == '}' {
				break
			}
			val = append(val, c)
			i++
		}
		out = append(out, Label{key, string(val)})
		if s[i] == '}' {
			return out, s[i+1:], nil
		}
		i++
	}
}

// @id CODE-INGEST-001
// @implements REQ-INGEST-001 REQ-INGEST-002 REQ-INGEST-003 REQ-INGEST-004 REQ-INGEST-005 REQ-INGEST-006 REQ-INGEST-007
func ParseLine(line string, lim contract.Limits) (Point, error) {
	if len(line) > lim.MaxLineLen {
		return Point{}, ErrTooLong
	}
	i := 0
	for i < len(line) && line[i] != ' ' && line[i] != '{' {
		i++
	}
	name, rest := line[:i], line[i:]
	var labels []Label
	if strings.HasPrefix(rest, "{") {
		var err error
		if labels, rest, err = parseLabels(rest[1:]); err != nil {
			return Point{}, err
		}
	}
	if !strings.HasPrefix(rest, " ") {
		return Point{}, ErrFormat
	}
	fields := strings.Split(rest[1:], " ")
	if len(fields) != 2 {
		return Point{}, ErrFormat
	}
	if !validIdent(name, true) || len(name) > lim.MaxNameLen {
		return Point{}, ErrName
	}
	if len(labels) > lim.MaxLabels {
		return Point{}, ErrLabels
	}
	seen := map[string]bool{}
	for _, l := range labels {
		if !validIdent(l.K, false) || seen[l.K] || len(l.V) > lim.MaxLabelValueLen {
			return Point{}, ErrLabels
		}
		seen[l.K] = true
	}
	sort.Slice(labels, func(a, b int) bool { return labels[a].K < labels[b].K })
	if !allDigits(fields[0]) {
		return Point{}, ErrValue
	}
	v, err := strconv.ParseUint(fields[0], 10, 64)
	if err != nil {
		return Point{}, ErrValue
	}
	if !allDigits(fields[1]) {
		return Point{}, ErrTimestamp
	}
	ts, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return Point{}, ErrTimestamp
	}
	return Point{Name: name, Labels: labels, Value: v, TS: ts}, nil
}

var keyEscaper = strings.NewReplacer(`\`, `\\`, `"`, `\"`, `,`, `\,`, `}`, `\}`)

// @id CODE-INGEST-008
// @implements REQ-INGEST-008
func SeriesKey(p Point) string {
	ls := append([]Label(nil), p.Labels...)
	sort.Slice(ls, func(a, b int) bool { return ls[a].K < ls[b].K })
	var b strings.Builder
	b.WriteString(p.Name)
	b.WriteByte('{')
	for i, l := range ls {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(l.K + `="` + keyEscaper.Replace(l.V) + `"`)
	}
	b.WriteByte('}')
	return b.String()
}

// @id CODE-INGEST-009
// @implements REQ-INGEST-009
func ParseBatch(text string, lim contract.Limits) ([]Point, []LineError) {
	var pts []Point
	var errs []LineError
	for i, raw := range strings.Split(text, "\n") {
		line := strings.TrimSuffix(raw, "\r")
		if t := strings.TrimSpace(line); t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		p, err := ParseLine(line, lim)
		if err != nil {
			errs = append(errs, LineError{i + 1, err})
			continue
		}
		pts = append(pts, p)
	}
	return pts, errs
}

// @id CODE-INGEST-010
// @implements REQ-INGEST-010
func CheckSkew(p Point, now int64, lim contract.Limits) error {
	if p.TS > now && uint64(p.TS)-uint64(now) > uint64(lim.MaxSkewSeconds) {
		return ErrSkew
	}
	return nil
}

type Deduper struct {
	capacity int
	order    []string
	set      map[string]struct{}
}

// @id CODE-INGEST-011
// @implements REQ-INGEST-011
func NewDeduper(capacity int) (*Deduper, error) {
	if capacity <= 0 {
		return nil, ErrCapacity
	}
	return &Deduper{capacity: capacity, set: map[string]struct{}{}}, nil
}

func (d *Deduper) Seen(p Point) bool {
	k := SeriesKey(p) + "|" + strconv.FormatInt(p.TS, 10) + "|" + strconv.FormatUint(p.Value, 10)
	if _, ok := d.set[k]; ok {
		return true
	}
	d.set[k] = struct{}{}
	d.order = append(d.order, k)
	if len(d.order) > d.capacity {
		delete(d.set, d.order[0])
		d.order = d.order[1:]
	}
	return false
}
