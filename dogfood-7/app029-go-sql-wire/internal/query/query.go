package query

import (
	"regexp"
	"strconv"
	"strings"
)

type Error struct{ Code, Message string }

func (e *Error) Error() string { return e.Code + ": " + e.Message }

type Statement struct {
	SQL     string
	Columns []string
	Params  int
	exprs   []string
	series  []int
}
type Portal struct {
	Statement *Statement
	rows      [][]*string
	pos       int
}
type Engine struct {
	statements map[string]*Statement
	portals    map[string]*Portal
}

func New() *Engine {
	return &Engine{statements: make(map[string]*Statement), portals: make(map[string]*Portal)}
}

var seriesRE = regexp.MustCompile(`(?i)^generate_series\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$`)
var integerRE = regexp.MustCompile(`^-?\d+$`)
var parameterRE = regexp.MustCompile(`^\$([1-9]\d*)$`)
var quotedRE = regexp.MustCompile(`^'(?:[^']|'')*'$`)

func expressions(s string) ([]string, error) {
	parts := []string{}
	start := 0
	quoted := false
	for i := 0; i < len(s); i++ {
		if s[i] == '\'' {
			if quoted && i+1 < len(s) && s[i+1] == '\'' {
				i++
				continue
			}
			quoted = !quoted
		}
		if s[i] == ',' && !quoted {
			parts = append(parts, strings.TrimSpace(s[start:i]))
			start = i + 1
		}
	}
	if quoted {
		return nil, &Error{"42601", "unterminated literal"}
	}
	return append(parts, strings.TrimSpace(s[start:])), nil
}

// @id CODE-QUERY-001 @implements REQ-QUERY-001 REQ-QUERY-002 REQ-QUERY-005 REQ-QUERY-006 REQ-QUERY-011
func (e *Engine) Prepare(name, sql string) (*Statement, error) {
	if name != "" && e.statements[name] != nil {
		return nil, &Error{"42P05", "duplicate statement"}
	}
	if e.statements[name] == nil && len(e.statements) >= 128 {
		return nil, &Error{"54000", "statement limit"}
	}
	text := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(sql), ";"))
	if len(text) < 7 || !strings.EqualFold(text[:7], "SELECT ") {
		return nil, &Error{"42601", "only SELECT expressions supported"}
	}
	body := strings.TrimSpace(text[7:])
	st := &Statement{SQL: sql}
	if m := seriesRE.FindStringSubmatch(body); m != nil {
		lo, err1 := strconv.ParseInt(m[1], 10, 32)
		hi, err2 := strconv.ParseInt(m[2], 10, 32)
		if err1 != nil || err2 != nil || hi-lo > 9999 {
			return nil, &Error{"54000", "series limit"}
		}
		st.series = []int{int(lo), int(hi)}
		st.Columns = []string{"generate_series"}
	} else {
		parts, err := expressions(body)
		if err != nil {
			return nil, err
		}
		if len(parts) > 128 {
			return nil, &Error{"54000", "column limit"}
		}
		for _, v := range parts {
			if m := parameterRE.FindStringSubmatch(v); m != nil {
				n, err := strconv.Atoi(m[1])
				if err != nil || n > 128 {
					return nil, &Error{"54000", "parameter limit"}
				}
				if n > st.Params {
					st.Params = n
				}
			} else if !integerRE.MatchString(v) && !strings.EqualFold(v, "NULL") && !quotedRE.MatchString(v) {
				return nil, &Error{"42601", "unsupported expression"}
			}
			st.Columns = append(st.Columns, "?column?")
		}
		st.exprs = parts
	}
	e.statements[name] = st
	return st, nil
}

// @id CODE-QUERY-002 @implements REQ-QUERY-003 REQ-QUERY-004
func (e *Engine) Bind(portal, statement string, args []*string) (*Portal, error) {
	st, err := e.Statement(statement)
	if err != nil {
		return nil, err
	}
	if len(args) != st.Params {
		return nil, &Error{"08P01", "parameter count mismatch"}
	}
	if portal != "" && e.portals[portal] != nil {
		return nil, &Error{"42P03", "duplicate portal"}
	}
	if e.portals[portal] == nil && len(e.portals) >= 128 {
		return nil, &Error{"54000", "portal limit"}
	}
	p := &Portal{Statement: st}
	if st.series != nil {
		for i := st.series[0]; i <= st.series[1]; i++ {
			v := strconv.Itoa(i)
			p.rows = append(p.rows, []*string{&v})
		}
	} else {
		row := make([]*string, len(st.exprs))
		for i, expr := range st.exprs {
			var v string
			if strings.EqualFold(expr, "NULL") {
				continue
			}
			if m := parameterRE.FindStringSubmatch(expr); m != nil {
				n, _ := strconv.Atoi(m[1])
				if args[n-1] == nil {
					continue
				}
				v = *args[n-1]
			} else if expr[0] == '\'' {
				v = strings.ReplaceAll(expr[1:len(expr)-1], "''", "'")
			} else {
				v = expr
			}
			row[i] = &v
		}
		p.rows = [][]*string{row}
	}
	e.portals[portal] = p
	return p, nil
}

// @id CODE-QUERY-003 @implements REQ-QUERY-007 REQ-QUERY-008
func (p *Portal) Execute(max uint32) ([][]*string, bool, error) {
	end := len(p.rows)
	if max > 0 && uint64(max) < uint64(end-p.pos) {
		end = p.pos + int(max)
	}
	rows := p.rows[p.pos:end]
	p.pos = end
	return rows, p.pos == len(p.rows), nil
}
func (p *Portal) Count() int { return len(p.rows) }

// @id CODE-QUERY-004 @implements REQ-QUERY-009 REQ-QUERY-010
func (e *Engine) Statement(name string) (*Statement, error) {
	st, ok := e.statements[name]
	if !ok {
		return nil, &Error{"26000", "unknown statement"}
	}
	return st, nil
}
func (e *Engine) Portal(name string) (*Portal, error) {
	p, ok := e.portals[name]
	if !ok {
		return nil, &Error{"34000", "unknown portal"}
	}
	return p, nil
}
func (e *Engine) Close(kind byte, name string) error {
	switch kind {
	case 'S':
		if _, err := e.Statement(name); err != nil {
			return err
		}
		delete(e.statements, name)
	case 'P':
		if _, err := e.Portal(name); err != nil {
			return err
		}
		delete(e.portals, name)
	default:
		return &Error{"08P01", "unknown resource kind"}
	}
	return nil
}
