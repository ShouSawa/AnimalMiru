// estimator/helper_test.go
package estimator

import (
	"math"
	"testing"
)

func near(t *testing.T, name string, got, want, tol float64) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Errorf("%s: got %.7f, want %.7f", name, got, want)
	}
}

// gaussBel は中心 (cx, cy)，標準偏差 sigma[m] の2次元ガウスを正規化した信念
func gaussBel(g Grid, sigma float64, centers ...[2]float64) []float64 {
	bel := make([]float64, g.N())
	sum := 0.0
	for i := range bel {
		x, y := g.Center(i)
		for _, c := range centers {
			d2 := (x-c[0])*(x-c[0]) + (y-c[1])*(y-c[1])
			bel[i] += math.Exp(-d2 / (2 * sigma * sigma))
		}
		sum += bel[i]
	}
	for i := range bel {
		bel[i] /= sum
	}
	return bel
}

func total(bel []float64) float64 {
	s := 0.0
	for _, b := range bel {
		s += b
	}
	return s
}
