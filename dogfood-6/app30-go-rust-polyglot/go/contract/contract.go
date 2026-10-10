package contract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/bits"
	"os"
)

var (
	ErrUnknown   = errors.New("ErrUnknown")
	ErrLimits    = errors.New("ErrLimits")
	ErrQuantiles = errors.New("ErrQuantiles")
	ErrTiers     = errors.New("ErrTiers")
)

type Tier struct {
	Name    string `json:"name"`
	Seconds int64  `json:"seconds"`
}

type Limits struct {
	MaxLabels        int `json:"maxLabels"`
	MaxLabelValueLen int `json:"maxLabelValueLen"`
	MaxNameLen       int `json:"maxNameLen"`
	MaxLineLen       int `json:"maxLineLen"`
	MaxSkewSeconds   int `json:"maxSkewSeconds"`
	MaxSeries        int `json:"maxSeries"`
}

type Config struct {
	ContractVersion int       `json:"contractVersion"`
	WireVersion     int       `json:"wireVersion"`
	BucketSubBits   int       `json:"bucketSubBits"`
	MaxBucketIndex  int       `json:"maxBucketIndex"`
	Quantiles       []float64 `json:"quantiles"`
	Tiers           []Tier    `json:"tiers"`
	Limits          Limits    `json:"limits"`
}

// @id CODE-CONTRACT-001
// @implements REQ-CONTRACT-001
func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return LoadBytes(b)
}

// @id CODE-CONTRACT-006
// @implements REQ-CONTRACT-006
func LoadBytes(b []byte) (*Config, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.DisallowUnknownFields()
	var c Config
	if err := dec.Decode(&c); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnknown, err)
	}
	if c.WireVersion != 1 {
		return nil, fmt.Errorf("%w: wireVersion %d", ErrUnknown, c.WireVersion)
	}
	return &c, nil
}

// @id CODE-CONTRACT-002
// @implements REQ-CONTRACT-002 REQ-CONTRACT-003 REQ-CONTRACT-004
func Validate(c *Config) error {
	if len(c.Tiers) == 0 || c.Tiers[0].Seconds <= 0 {
		return ErrTiers
	}
	for i := 1; i < len(c.Tiers); i++ {
		prev, cur := c.Tiers[i-1].Seconds, c.Tiers[i].Seconds
		if cur <= prev || cur%prev != 0 {
			return ErrTiers
		}
	}
	if len(c.Quantiles) == 0 {
		return ErrQuantiles
	}
	last := 0.0
	for _, q := range c.Quantiles {
		if !(q > last && q < 1) {
			return ErrQuantiles
		}
		last = q
	}
	l := c.Limits
	for _, v := range []int{l.MaxLabels, l.MaxLabelValueLen, l.MaxNameLen, l.MaxLineLen, l.MaxSkewSeconds, l.MaxSeries} {
		if v <= 0 {
			return ErrLimits
		}
	}
	return nil
}

// @id CODE-CONTRACT-005
// @implements REQ-CONTRACT-005
func BucketIndex(v uint64) int {
	e := bits.Len64(v) - 4
	if e < 0 {
		e = 0
	}
	return 8*e + int(v>>uint(e))
}

// @id CODE-CONTRACT-007
// @implements REQ-CONTRACT-005
func BucketBounds(i int) (lo, hi uint64) {
	if i < 8 {
		return uint64(i), uint64(i)
	}
	e := uint(i/8 - 1)
	m := uint64(i) - 8*uint64(e)
	lo = m << e
	hi = (m+1)<<e - 1
	if m == 15 && e == 60 {
		hi = ^uint64(0)
	}
	return
}
