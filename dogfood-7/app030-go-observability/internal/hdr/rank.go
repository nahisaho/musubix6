package hdr

import "math/big"

// @id CODE-METRIC-004 @implements REQ-METRIC-010 REQ-METRIC-011
func Rank(count int64, q float64) int64 {
	fraction := new(big.Rat).SetFloat64(q)
	fraction.Mul(fraction, new(big.Rat).SetInt64(count))
	quotient, remainder := new(big.Int), new(big.Int)
	quotient.QuoRem(fraction.Num(), fraction.Denom(), remainder)
	if remainder.Sign() != 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	return max(int64(1), quotient.Int64())
}
