package wal

import (
	"dogfood/lsm/memtable"
	"encoding/binary"
	"encoding/json"
	"errors"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"sync"
)

const maxFrame = 16 << 20

// @id CODE-WAL-001 @implements REQ-WAL-001 REQ-WAL-002 REQ-WAL-003 REQ-WAL-004 REQ-WAL-005 REQ-WAL-006 REQ-WAL-007 REQ-WAL-008
type Log struct {
	mu     sync.Mutex
	file   journalFile
	syncs  int
	failed error
}
type journalFile interface {
	Write([]byte) (int, error)
	Sync() error
	Close() error
}

func Open(p string) (*Log, error) {
	f, err := os.OpenFile(p, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0644)
	if err != nil {
		return nil, err
	}
	offset, err := validTailOffset(f)
	if err != nil {
		f.Close()
		return nil, err
	}
	if err = f.Truncate(offset); err != nil {
		f.Close()
		return nil, err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return nil, err
	}
	d, err := os.Open(filepath.Dir(p))
	if err != nil {
		f.Close()
		return nil, err
	}
	err = d.Sync()
	d.Close()
	if err != nil {
		f.Close()
		return nil, err
	}
	return &Log{file: f}, nil
}

// @id CODE-WAL-010 @implements REQ-WAL-010
func validTailOffset(f *os.File) (int64, error) { _, offset, err := decode(f); return offset, err }
func decode(f *os.File) ([]memtable.Record, int64, error) {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, 0, err
	}
	var rs []memtable.Record
	var offset int64
	for {
		var header [8]byte
		n, err := io.ReadFull(f, header[:])
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return rs, offset, nil
		}
		if err != nil {
			return nil, offset, err
		}
		length := binary.LittleEndian.Uint32(header[:4])
		if length > maxFrame {
			return nil, offset, errors.New("WAL frame too large")
		}
		payload := make([]byte, length)
		_, err = io.ReadFull(f, payload)
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return rs, offset, nil
		}
		if err != nil {
			return nil, offset, err
		}
		if crc32.ChecksumIEEE(payload) != binary.LittleEndian.Uint32(header[4:]) {
			return nil, offset, errors.New("WAL checksum mismatch")
		}
		var r memtable.Record
		if err = json.Unmarshal(payload, &r); err != nil {
			return nil, offset, err
		}
		rs = append(rs, r)
		offset += int64(n) + int64(length)
	}
}
func Recover(p string) ([]memtable.Record, error) {
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	rs, _, err := decode(f)
	return rs, err
}
func (l *Log) Append(r memtable.Record) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file == nil {
		return errors.New("WAL closed")
	}
	if l.failed != nil {
		return l.failed
	}
	payload, err := json.Marshal(r)
	if err != nil {
		return err
	}
	if len(payload) > maxFrame {
		return errors.New("WAL frame too large")
	}
	frame := make([]byte, 8+len(payload))
	binary.LittleEndian.PutUint32(frame[:4], uint32(len(payload)))
	binary.LittleEndian.PutUint32(frame[4:8], crc32.ChecksumIEEE(payload))
	copy(frame[8:], payload)
	return l.appendFrame(frame)
}

// @id CODE-WAL-011 @implements REQ-WAL-011
func (l *Log) appendFrame(frame []byte) error {
	n, err := l.file.Write(frame)
	if err == nil && n != len(frame) {
		err = io.ErrShortWrite
	}
	if err != nil {
		l.failed = err
		return err
	}
	if err = l.file.Sync(); err != nil {
		l.failed = err
		return err
	}
	l.syncs++
	return nil
}
func (l *Log) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file == nil {
		return nil
	}
	err := l.file.Close()
	l.file = nil
	return err
}
func (l *Log) Syncs() int { l.mu.Lock(); defer l.mu.Unlock(); return l.syncs }
