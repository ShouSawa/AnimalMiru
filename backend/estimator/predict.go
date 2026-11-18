// estimator/predict.go
package estimator

// Predict は信念をガウスカーネルでぼかす（動きの予測）．
// 行方向→列方向の分離畳み込みで，境界は反射する（質量が保存され，一様は一様のまま）
func Predict(bel []float64, g Grid, ker []float64) []float64 {
	r := len(ker) / 2
	tmp := make([]float64, len(bel))
	out := make([]float64, len(bel))
	for iy := 0; iy < g.Ny; iy++ {
		for ix := 0; ix < g.Nx; ix++ {
			for k, w := range ker {
				tmp[iy*g.Nx+ix] += w * bel[iy*g.Nx+reflect(ix+k-r, g.Nx)]
			}
		}
	}
	for iy := 0; iy < g.Ny; iy++ {
		for ix := 0; ix < g.Nx; ix++ {
			for k, w := range ker {
				out[iy*g.Nx+ix] += w * tmp[reflect(iy+k-r, g.Ny)*g.Nx+ix]
			}
		}
	}
	return out
}

// reflect は範囲外の添字を端のセルを繰り返す形で折り返す（-1→0，-2→1，n→n-1）
func reflect(j, n int) int {
	if j < 0 {
		return -1 - j
	}
	if j >= n {
		return 2*n - 1 - j
	}
	return j
}
