package spike

import (
	"bytes"
	"io"
	"net"
	"testing"
	"time"
)

func clone[T any](values []T) []T { return append([]T(nil), values...) }

func TestRuntime(t *testing.T) {
	a, b := net.Pipe()
	defer a.Close()
	defer b.Close()
	a.SetDeadline(time.Now().Add(time.Second))
	b.SetDeadline(time.Now().Add(time.Second))
	result := make(chan error, 1)
	go func() { _, err := a.Write([]byte{0, 0, 0, 8, 0, 3, 0, 0}); result <- err }()
	got := make([]byte, 8)
	if _, err := io.ReadFull(b, got); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(clone(got), []byte{0, 0, 0, 8, 0, 3, 0, 0}) {
		t.Fatal("framing")
	}
	if err := <-result; err != nil {
		t.Fatal(err)
	}
}
