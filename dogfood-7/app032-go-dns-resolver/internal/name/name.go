package name

import (
	"errors"
	"strings"
)

func Canonical(s string) (string, error) {
	s = strings.ToLower(s)
	if s == "." {
		return s, nil
	}
	s = strings.TrimSuffix(s, ".")
	if s == "" || len(s)+2 > 255 {
		return "", errors.New("invalid name length")
	}
	for _, label := range strings.Split(s, ".") {
		if len(label) == 0 || len(label) > 63 {
			return "", errors.New("invalid label")
		}
		for _, c := range label {
			if c < 33 || c > 126 {
				return "", errors.New("non ASCII label")
			}
		}
	}
	return s + ".", nil
}

func Within(owner, zone string) bool {
	o, e := Canonical(owner)
	if e != nil {
		return false
	}
	z, e := Canonical(zone)
	if e != nil {
		return false
	}
	return z == "." || o == z || strings.HasSuffix(o, "."+z)
}
