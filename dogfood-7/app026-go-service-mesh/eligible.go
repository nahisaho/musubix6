package mesh

// @id CODE-MODEL-004 @implements REQ-MODEL-009 REQ-MODEL-010
func Eligible(endpoints []Endpoint) []Endpoint {
	out := make([]Endpoint, 0, len(endpoints))
	for _, e := range endpoints {
		if e.Healthy {
			out = append(out, e)
		}
	}
	return out
}
