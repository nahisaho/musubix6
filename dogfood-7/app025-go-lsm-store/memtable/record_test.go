package memtable

import (
	"bytes"
	"encoding/json"
	"testing"
)

// @id TEST-MEM-010 @verifies REQ-MEM-009
func TestTEST_MEM_010(t *testing.T) {
	for _, key := range []string{"ascii", "日本語", "", "\xff", "\xfe", "nul\x00key"} {
		r := Record{Key: key, Seq: 42, Value: []byte{0, 255, 128}, Deleted: true}
		b, err := json.Marshal(r)
		if err != nil {
			t.Fatal(err)
		}
		var got Record
		if err = json.Unmarshal(b, &got); err != nil {
			t.Fatal(err)
		}
		if got.Key != r.Key || got.Seq != r.Seq || !bytes.Equal(got.Value, r.Value) || got.Deleted != r.Deleted {
			t.Fatalf("record roundtrip: key=%x got=%x", r.Key, got.Key)
		}
	}
}
