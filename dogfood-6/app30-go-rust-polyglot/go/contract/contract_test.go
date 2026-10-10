package contract

import (
	"bufio"
	"errors"
	"os"
	"strconv"
	"strings"
	"testing"
)

func validCfg() *Config {
	return &Config{
		ContractVersion: 1, WireVersion: 1, BucketSubBits: 3, MaxBucketIndex: 495,
		Quantiles: []float64{0.5, 0.99},
		Tiers:     []Tier{{"1m", 60}, {"5m", 300}, {"1h", 3600}},
		Limits:    Limits{8, 64, 128, 4096, 300, 1000},
	}
}

// @id TEST-CONTRACT-001
// @verifies REQ-CONTRACT-001
func TestTEST_CONTRACT_001_load(t *testing.T) {
	c, err := Load("../../contract/metrics.json")
	if err != nil {
		t.Fatal(err)
	}
	if c.ContractVersion != 1 || c.WireVersion != 1 || len(c.Quantiles) != 4 || c.Quantiles[3] != 0.999 {
		t.Fatalf("bad config %+v", c)
	}
}

// @id TEST-CONTRACT-002
// @verifies REQ-CONTRACT-002
func TestTEST_CONTRACT_002_tiers(t *testing.T) {
	bad := [][]Tier{
		{{"a", 60}, {"b", 60}},
		{{"a", 60}, {"b", 90}},
		{{"a", 300}, {"b", 60}},
		{{"a", 0}},
		{},
	}
	for i, tiers := range bad {
		c := validCfg()
		c.Tiers = tiers
		if err := Validate(c); !errors.Is(err, ErrTiers) {
			t.Fatalf("case %d: want ErrTiers got %v", i, err)
		}
	}
	if err := Validate(validCfg()); err != nil {
		t.Fatal(err)
	}
}

// @id TEST-CONTRACT-003
// @verifies REQ-CONTRACT-003
func TestTEST_CONTRACT_003_quantiles(t *testing.T) {
	bad := [][]float64{{0.9, 0.5}, {0.5, 0.5}, {0, 0.5}, {0.5, 1}, {}, {-0.1}}
	for i, q := range bad {
		c := validCfg()
		c.Quantiles = q
		if err := Validate(c); !errors.Is(err, ErrQuantiles) {
			t.Fatalf("case %d: want ErrQuantiles got %v", i, err)
		}
	}
}

// @id TEST-CONTRACT-004
// @verifies REQ-CONTRACT-004
func TestTEST_CONTRACT_004_limits(t *testing.T) {
	for i := 0; i < 6; i++ {
		c := validCfg()
		p := []*int{&c.Limits.MaxLabels, &c.Limits.MaxLabelValueLen, &c.Limits.MaxNameLen, &c.Limits.MaxLineLen, &c.Limits.MaxSkewSeconds, &c.Limits.MaxSeries}[i]
		*p = 0
		if err := Validate(c); !errors.Is(err, ErrLimits) {
			t.Fatalf("limit %d: want ErrLimits got %v", i, err)
		}
	}
}

// @id TEST-CONTRACT-005
// @verifies REQ-CONTRACT-005
func TestTEST_CONTRACT_005_vectors(t *testing.T) {
	f, err := os.Open("../../contract/vectors.tsv")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	rows := 0
	for sc.Scan() {
		p := strings.Split(sc.Text(), "\t")
		v, _ := strconv.ParseUint(p[0], 10, 64)
		idx, _ := strconv.Atoi(p[1])
		lo, _ := strconv.ParseUint(p[2], 10, 64)
		hi, _ := strconv.ParseUint(p[3], 10, 64)
		if got := BucketIndex(v); got != idx {
			t.Fatalf("index(%d)=%d want %d", v, got, idx)
		}
		if l, h := BucketBounds(idx); l != lo || h != hi {
			t.Fatalf("bounds(%d)=%d,%d want %d,%d", idx, l, h, lo, hi)
		}
		rows++
	}
	if rows < 10 {
		t.Fatalf("only %d rows", rows)
	}
}

// @id TEST-CONTRACT-006
// @verifies REQ-CONTRACT-006
func TestTEST_CONTRACT_006_unknown(t *testing.T) {
	if _, err := LoadBytes([]byte(`{"contractVersion":1,"wireVersion":1,"surprise":true}`)); !errors.Is(err, ErrUnknown) {
		t.Fatalf("unknown field: %v", err)
	}
	if _, err := LoadBytes([]byte(`{"contractVersion":1,"wireVersion":2}`)); !errors.Is(err, ErrUnknown) {
		t.Fatalf("wire version: %v", err)
	}
}
