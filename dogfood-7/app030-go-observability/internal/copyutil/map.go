package copyutil

func Map[K comparable, V any](src map[K]V) map[K]V {
	out := make(map[K]V, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}
