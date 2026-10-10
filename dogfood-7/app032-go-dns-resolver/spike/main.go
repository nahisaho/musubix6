//go:build ignore

package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"net"
)

func main() {
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		panic(err)
	}
	b := make([]byte, 2)
	binary.BigEndian.PutUint16(b, 42)
	if !ed25519.Verify(pub, b, ed25519.Sign(key, b)) {
		panic("crypto")
	}
	s, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	defer s.Close()
	fmt.Println("spike PASS: Ed25519, big-endian codec, loopback UDP", s.LocalAddr())
}
