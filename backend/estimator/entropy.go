// estimator/entropy.go
package estimator

import "math"

// Entropy は信念のエントロピー[bit]を返す（0·log0=0）．一様で最大 log2(N)
func Entropy(bel []float64) float64 {
	h := 0.0
	for _, b := range bel {
		if b > 0 {
			h -= b * math.Log2(b)
		}
	}
	return h
}
