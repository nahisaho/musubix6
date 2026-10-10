package name

import (
	"strings"
	"testing"
)

func TestCanonicalAndBailiwick(t *testing.T) {
	for _, tc := range []struct{ in, want string }{{".", "."}, {"EXample.COM", "example.com."}, {"a.", "a."}} {
		t.Run(tc.in, func(t *testing.T) {
			got, err := Canonical(tc.in)
			if err != nil || got != tc.want {
				t.Fatalf("%q %v", got, err)
			}
		})
	}
	for _, bad := range []string{"", "a..b.", "é.example.", strings.Repeat("a", 64) + ".", "a\n."} {
		if _, err := Canonical(bad); err == nil {
			t.Fatalf("invalid accepted %q", bad)
		}
	}
	if Within("notexample.", "example.") || !Within("ns.example.", "example.") || !Within("example.", ".") {
		t.Fatal("zone label boundary")
	}
}
