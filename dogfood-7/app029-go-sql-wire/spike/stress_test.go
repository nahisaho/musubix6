//go:build stress

package spike

import (
	"bytes"
	"testing"

	"example.com/sqlwire/internal/wire"
)

func TestTaggedCodec(t *testing.T) {
	for tag := 0; tag < 256; tag++ {
		t.Run(string(rune(tag+256)), func(t *testing.T) {
			body := clone([]byte{byte(tag), 0, 127, 255})
			var encoded bytes.Buffer
			if err := wire.Write(&encoded, byte(tag), body); err != nil {
				t.Fatal(err)
			}
			frame, err := wire.Read(&encoded, wire.Limit)
			if err != nil || frame.Tag != byte(tag) || !bytes.Equal(frame.Body, body) {
				t.Fatalf("tag %d", tag)
			}
		})
	}
}
