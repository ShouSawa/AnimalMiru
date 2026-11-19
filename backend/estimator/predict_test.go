// estimator/predict_test.go
package estimator

import (
	"math"
	"math/rand"
	"testing"
)

func predictFrom(g Grid, bel []float64) []float64 {
	return Predict(bel, g, Kernel(2.0/g.H))
}

func TestPredictUniform(t *testing.T) {
	g := DefaultGrid()
	out := predictFrom(g, g.Uniform())
	for i, b := range out {
		if math.Abs(b-1/float64(g.N())) > 1e-15 {
			t.Fatalf("i=%d: %v", i, b)
		}
	}
}

func TestPredictMassConserved(t *testing.T) {
	g := DefaultGrid()
	rng := rand.New(rand.NewSource(1))
	bel := make([]float64, g.N())
	for i := range bel {
		bel[i] = rng.Float64()
	}
	sum := total(bel)
	for i := range bel {
		bel[i] /= sum
	}
	near(t, "合計", total(predictFrom(g, bel)), 1, 1e-12)
}

func TestPredictPoint(t *testing.T) {
	g := DefaultGrid()
	cases := []struct {
		name string
		cell int
		max  float64
	}{
		{"角(0,0)", 0, 0.038708},
		{"中央(30,30)", 30*60 + 30, 0.0099817},
	}
	for _, c := range cases {
		bel := make([]float64, g.N())
		bel[c.cell] = 1
		out := predictFrom(g, bel)
		near(t, c.name+" 合計", total(out), 1, 1e-12)
		maxIdx := 0
		for i, b := range out {
			if b > out[maxIdx] {
				maxIdx = i
			}
		}
		if maxIdx != c.cell {
			t.Errorf("%s: 最大セルが %d", c.name, maxIdx)
		}
		near(t, c.name+" 最大値", out[maxIdx], c.max, 5e-7)
	}
}

func TestKernel(t *testing.T) {
	ker := Kernel(4)
	if len(ker) != 25 {
		t.Errorf("長さ %d（25のはず）", len(ker))
	}
	near(t, "合計", total(ker), 1, 1e-12)
}

func TestReflect(t *testing.T) {
	cases := [][3]int{{-1, 60, 0}, {-2, 60, 1}, {60, 60, 59}, {61, 60, 58}, {5, 60, 5}}
	for _, c := range cases {
		if got := reflect(c[0], c[1]); got != c[2] {
			t.Errorf("reflect(%d,%d)=%d, want %d", c[0], c[1], got, c[2])
		}
	}
}
