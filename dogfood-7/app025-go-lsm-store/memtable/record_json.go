package memtable

import "encoding/json"

type wireRecord struct {
	Key     []byte
	Seq     uint64
	Value   []byte
	Deleted bool
}

// @id CODE-MEM-010 @implements REQ-MEM-009
func (r Record) MarshalJSON() ([]byte, error) {
	return json.Marshal(wireRecord{[]byte(r.Key), r.Seq, r.Value, r.Deleted})
}
func (r *Record) UnmarshalJSON(b []byte) error {
	var w wireRecord
	if err := json.Unmarshal(b, &w); err != nil {
		return err
	}
	*r = Record{Key: string(w.Key), Seq: w.Seq, Value: w.Value, Deleted: w.Deleted}
	return nil
}
