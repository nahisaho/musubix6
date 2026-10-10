package watch

import (
	"context"
	"errors"
	"sync"

	"kvwatch/mvcc"
)

var (
	ErrCanceled    = errors.New("watch: stream canceled")
	ErrSlowWatcher = errors.New("watch: watcher too slow, canceled")
)

type Options struct {
	End        string
	StartRev   int64
	NoPut      bool
	NoDelete   bool
	PrevKV     bool
	QueueLimit int
}

type Response struct {
	WatchID  int64
	Revision int64
	Events   []mvcc.Event
}

const defaultQueueLimit = 1024

// Stream is the receiving side of one watcher: an unbounded-until-limit queue plus a wake-up signal.
type Stream struct {
	id    int64
	mu    sync.Mutex
	q     []Response
	sig   chan struct{}
	done  bool
	err   error
	limit int
	onEnd func()
}

type watcher struct {
	mu      sync.Mutex
	h       *Hub
	st      *Stream
	key     string
	opts    Options
	lastRev int64
	syncing bool
	pending []mvcc.Event
}

type Hub struct {
	mu       sync.Mutex
	store    *mvcc.Store
	nextID   int64
	watchers map[int64]*watcher
}

func NewHub(s *mvcc.Store) *Hub {
	h := &Hub{store: s, watchers: map[int64]*watcher{}}
	s.Subscribe(h.notify)
	return h
}

// @id CODE-WATCH-001 @implements REQ-WATCH-003
func PrefixEnd(prefix string) string {
	b := []byte(prefix)
	for i := len(b) - 1; i >= 0; i-- {
		if b[i] < 0xff {
			b[i]++
			return string(b[:i+1])
		}
	}
	return "\x00"
}

func (w *watcher) matches(key string) bool {
	switch w.opts.End {
	case "":
		return key == w.key
	case "\x00":
		return key >= w.key
	}
	return key >= w.key && key < w.opts.End
}

// process delivers whole revisions in order, skipping revisions at or below lastRev. Callers hold w.mu.
// @id CODE-WATCH-002 @implements REQ-WATCH-004 REQ-WATCH-005 REQ-WATCH-006 REQ-WATCH-008
func (w *watcher) process(events []mvcc.Event) {
	for i := 0; i < len(events); {
		rev := events[i].KV.ModRev
		j := i
		for j < len(events) && events[j].KV.ModRev == rev {
			j++
		}
		group := events[i:j]
		i = j
		if rev <= w.lastRev {
			continue
		}
		w.lastRev = rev
		var out []mvcc.Event
		for _, e := range group {
			if !w.matches(e.KV.Key) || (w.opts.NoPut && e.Type == mvcc.EventPut) || (w.opts.NoDelete && e.Type == mvcc.EventDelete) {
				continue
			}
			if !w.opts.PrevKV {
				e.PrevKV = nil
			}
			out = append(out, e)
		}
		if len(out) > 0 {
			w.st.push(Response{WatchID: w.st.id, Revision: rev, Events: out})
		}
	}
}

// snapshot copies the watcher set so delivery happens without holding the hub lock.
func (h *Hub) snapshot() []*watcher {
	h.mu.Lock()
	defer h.mu.Unlock()
	ws := make([]*watcher, 0, len(h.watchers))
	for _, w := range h.watchers {
		ws = append(ws, w)
	}
	return ws
}

func (h *Hub) notify(events []mvcc.Event) {
	ws := h.snapshot()
	for _, w := range ws {
		w.mu.Lock()
		if w.syncing {
			w.pending = append(w.pending, events...)
		} else {
			w.process(events)
		}
		w.mu.Unlock()
	}
}

// Watch registers the watcher before reading history so no revision can fall between replay and live delivery.
// @id CODE-WATCH-003 @implements REQ-WATCH-001 REQ-WATCH-002 REQ-COMPACT-010
func (h *Hub) Watch(key string, opts Options) (*Stream, error) {
	if opts.QueueLimit <= 0 {
		opts.QueueLimit = defaultQueueLimit
	}
	h.mu.Lock()
	h.nextID++
	st := &Stream{id: h.nextID, sig: make(chan struct{}, 1), limit: opts.QueueLimit}
	w := &watcher{h: h, st: st, key: key, opts: opts, syncing: true}
	st.onEnd = func() { h.remove(st.id) }
	h.watchers[st.id] = w
	h.mu.Unlock()

	w.mu.Lock()
	defer w.mu.Unlock()
	start := opts.StartRev
	if start <= 0 {
		start = h.store.Rev() + 1
	}
	w.lastRev = start - 1
	history, err := h.store.EventsSince(start)
	if err != nil {
		h.remove(st.id)
		return nil, err
	}
	w.process(history)
	w.process(w.pending)
	w.pending, w.syncing = nil, false
	return st, nil
}

func (h *Hub) remove(id int64) {
	h.mu.Lock()
	delete(h.watchers, id)
	h.mu.Unlock()
}

// @id CODE-WATCH-004 @implements REQ-WATCH-009
func (h *Hub) Progress() {
	rev := h.store.Rev()
	ws := h.snapshot()
	for _, w := range ws {
		w.mu.Lock()
		if !w.syncing {
			w.st.push(Response{WatchID: w.st.id, Revision: rev})
		}
		w.mu.Unlock()
	}
}

func (h *Hub) Watchers() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.watchers)
}

func (st *Stream) ID() int64 { return st.id }

// @id CODE-WATCH-005 @implements REQ-WATCH-010
func (st *Stream) push(r Response) {
	st.mu.Lock()
	if st.done {
		st.mu.Unlock()
		return
	}
	if len(st.q) >= st.limit {
		st.finishLocked(ErrSlowWatcher)
		return
	}
	st.q = append(st.q, r)
	st.mu.Unlock()
	st.wake()
}

func (st *Stream) wake() {
	select {
	case st.sig <- struct{}{}:
	default:
	}
}

// finishLocked requires st.mu held and releases it.
func (st *Stream) finishLocked(err error) {
	st.done, st.err = true, err
	st.mu.Unlock()
	st.onEnd()
	st.wake()
}

func (st *Stream) TryNext() (Response, bool) {
	st.mu.Lock()
	defer st.mu.Unlock()
	if len(st.q) == 0 {
		return Response{}, false
	}
	r := st.q[0]
	st.q = st.q[1:]
	return r, true
}

func (st *Stream) Next(ctx context.Context) (Response, error) {
	for {
		st.mu.Lock()
		if len(st.q) > 0 {
			r := st.q[0]
			st.q = st.q[1:]
			st.mu.Unlock()
			return r, nil
		}
		if st.done {
			err := st.err
			st.mu.Unlock()
			st.wake()
			return Response{}, err
		}
		st.mu.Unlock()
		select {
		case <-st.sig:
		case <-ctx.Done():
			return Response{}, ctx.Err()
		}
	}
}

// @id CODE-WATCH-006 @implements REQ-WATCH-007
func (st *Stream) Cancel() {
	st.mu.Lock()
	if st.done {
		st.mu.Unlock()
		return
	}
	st.finishLocked(ErrCanceled)
}
