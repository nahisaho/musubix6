package wire

import (
	"bytes"
	"encoding/hex"
	"os"
	"reflect"
	"strings"
	"testing"
)

// @id TEST-WIRE-001 @verifies REQ-WIRE-001 REQ-WIRE-002
func TestTEST_WIRE_001(t *testing.T) {
	m := Message{ID: 42, Flags: 0x8180, Questions: []Question{{"example.", A, 1}}, Answers: []RR{{Name: "example.", Type: A, Class: 1, TTL: 300, Data: []byte{127, 0, 0, 1}}}}
	b, err := Encode(m)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Decode(b)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, m) {
		t.Fatalf("roundtrip got %#v", got)
	}
}

// @id TEST-WIRE-002 @verifies REQ-WIRE-003 REQ-WIRE-004
func TestTEST_WIRE_002(t *testing.T) {
	m := Message{Questions: []Question{{"www.example.", A, 1}}, Answers: []RR{{Name: "www.example.", Type: CNAME, Class: 1, TTL: 50, Target: "ns.example."}, {Name: "example.", Type: NS, Class: 1, TTL: 50, Target: "ns.example."}}}
	b, _ := Encode(m)
	if !bytes.Contains(b, []byte{0xc0, 0x0c}) {
		t.Fatal("compression pointer missing")
	}
	got, err := Decode(b)
	if err != nil || len(got.Answers) != 2 || got.Answers[1].Target != "ns.example." {
		t.Fatalf("name RDATA %#v %v", got, err)
	}
}

// @id TEST-WIRE-003 @verifies REQ-WIRE-005 REQ-WIRE-006
func TestTEST_WIRE_003(t *testing.T) {
	fixtures := []string{"000000000001000000000000c00c00010001", "000000000001000000000000c0ff00010001", "00", "000000000001000000000000036162"}
	for i, s := range fixtures {
		t.Run(string(rune('a'+i)), func(t *testing.T) {
			b, _ := hex.DecodeString(s)
			if _, err := Decode(b); err == nil {
				t.Fatal("malformed accepted")
			}
		})
	}
}

// @id TEST-WIRE-004 @verifies REQ-WIRE-007 REQ-WIRE-008
func TestTEST_WIRE_004(t *testing.T) {
	for _, n := range []string{strings.Repeat("x", 64) + ".", strings.Repeat(strings.Repeat("x", 63)+".", 4)} {
		if _, err := Encode(Message{Questions: []Question{{n, A, 1}}}); err == nil {
			t.Fatal("overlong accepted")
		}
	}
	b, err := Encode(Message{ID: 1, Questions: []Question{{"ExAmPlE.COM", A, 1}}})
	if err != nil {
		t.Fatal(err)
	}
	golden, err := os.ReadFile("testdata/question.hex")
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(b) != strings.TrimSpace(string(golden)) {
		t.Fatalf("golden mismatch: %x", b)
	}
}

// @id TEST-WIRE-005 @verifies REQ-WIRE-001 REQ-WIRE-007
func TestTEST_WIRE_005(t *testing.T) {
	m := Message{Questions: []Question{{strings.Repeat("a.", 127), A, 1}, {"b." + strings.Repeat("a.", 126), A, 1}}}
	b, err := Encode(m)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Decode(b)
	if err != nil || !reflect.DeepEqual(got, m) {
		t.Fatalf("max name roundtrip: %v %#v", err, got)
	}
}

func FuzzDecode(f *testing.F) {
	f.Add([]byte{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0})
	f.Add([]byte{0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0xc0, 0x0c, 0, 1, 0, 1})
	f.Fuzz(func(t *testing.T, b []byte) {
		m, err := Decode(b)
		if err != nil {
			return
		}
		encoded, err := Encode(m)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := Decode(encoded); err != nil {
			t.Fatal(err)
		}
	})
}
