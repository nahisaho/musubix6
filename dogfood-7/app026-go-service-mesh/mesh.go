package mesh

import "fmt"

type Endpoint struct {
	ID       string
	Address  string
	Weight   int
	Healthy  bool
	Metadata map[string]string
}
type Snapshot struct {
	Version   uint64
	Endpoints []Endpoint
}

// @id CODE-MODEL-001 @implements REQ-MODEL-001 REQ-MODEL-002 REQ-MODEL-003 REQ-MODEL-004
func (e Endpoint) Validate() error {
	if e.ID == "" || e.Address == "" || e.Weight <= 0 {
		return fmt.Errorf("invalid endpoint %q", e.ID)
	}
	return nil
}

// @id CODE-MODEL-002 @implements REQ-MODEL-005 REQ-MODEL-006
func (s Snapshot) Validate() error {
	if s.Version == 0 {
		return fmt.Errorf("version must be positive")
	}
	seen := make(map[string]bool)
	for _, e := range s.Endpoints {
		if err := e.Validate(); err != nil {
			return err
		}
		if seen[e.ID] {
			return fmt.Errorf("duplicate endpoint %q", e.ID)
		}
		seen[e.ID] = true
	}
	return nil
}

// @id CODE-MODEL-003 @implements REQ-MODEL-007 REQ-MODEL-008
func (s Snapshot) Clone() Snapshot {
	c := Snapshot{Version: s.Version, Endpoints: make([]Endpoint, len(s.Endpoints))}
	copy(c.Endpoints, s.Endpoints)
	for i, e := range s.Endpoints {
		if e.Metadata != nil {
			c.Endpoints[i].Metadata = make(map[string]string, len(e.Metadata))
			for k, v := range e.Metadata {
				c.Endpoints[i].Metadata[k] = v
			}
		}
	}
	return c
}
