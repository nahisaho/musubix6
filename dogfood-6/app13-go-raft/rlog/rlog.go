// Package rlog is a 1-indexed Raft log.
package rlog

type Entry struct {
	Term uint64
	Cmd  string
}

type Log struct{ es []Entry }

func New() *Log { return &Log{} }

/** @id CODE-RLOG-001 @implements REQ-RLOG-001 REQ-RLOG-002 */
func (l *Log) LastIndex() uint64 { return uint64(len(l.es)) }

func (l *Log) LastTerm() uint64 {
	if len(l.es) == 0 {
		return 0
	}
	return l.es[len(l.es)-1].Term
}

func (l *Log) Append(term uint64, cmd string) uint64 {
	l.es = append(l.es, Entry{Term: term, Cmd: cmd})
	return l.LastIndex()
}

/** @id CODE-RLOG-002 @implements REQ-RLOG-003 */
func (l *Log) Term(i uint64) (uint64, bool) {
	if i == 0 {
		return 0, true
	}
	if i > l.LastIndex() {
		return 0, false
	}
	return l.es[i-1].Term, true
}

func (l *Log) Get(i uint64) (Entry, bool) {
	if i == 0 || i > l.LastIndex() {
		return Entry{}, false
	}
	return l.es[i-1], true
}

/** @id CODE-RLOG-003 @implements REQ-RLOG-004 */
func (l *Log) Match(prevIdx, prevTerm uint64) bool {
	t, ok := l.Term(prevIdx)
	return ok && t == prevTerm
}

/** @id CODE-RLOG-004 @implements REQ-RLOG-005 REQ-RLOG-006 REQ-RLOG-007 REQ-RLOG-008 */
func (l *Log) Merge(prevIdx, prevTerm uint64, es []Entry) (uint64, bool) {
	if !l.Match(prevIdx, prevTerm) {
		return 0, false
	}
	for k, e := range es {
		idx := prevIdx + uint64(k) + 1
		if t, ok := l.Term(idx); ok {
			if t == e.Term {
				continue
			}
			l.es = l.es[:idx-1]
		}
		l.es = append(l.es, es[k:]...)
		break
	}
	return prevIdx + uint64(len(es)), true
}

/** @id CODE-RLOG-005 @implements REQ-RLOG-009 */
func (l *Log) UpToDate(lastTerm, lastIdx uint64) bool {
	if lastTerm != l.LastTerm() {
		return lastTerm > l.LastTerm()
	}
	return lastIdx >= l.LastIndex()
}

/** @id CODE-RLOG-006 @implements REQ-RLOG-010 */
func (l *Log) Slice(from uint64, max int) []Entry {
	if from == 0 || from > l.LastIndex() || max <= 0 {
		return []Entry{}
	}
	end := from - 1 + uint64(max)
	if end > l.LastIndex() {
		end = l.LastIndex()
	}
	return append([]Entry{}, l.es[from-1:end]...)
}
