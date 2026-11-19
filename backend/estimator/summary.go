// estimator/summary.go
package estimator

// Summary は信念の要約．est は最大セルの中心，mean は事後平均，PMax は最大セルの確率[%]
type Summary struct {
	EstX, EstY, MeanX, MeanY, PMax float64
}

// Summarize は信念から est，mean，p_max を求める．
// 最大が複数あれば（max×(1-1e-9) 以上のセル全部）その中心の平均を est とする
func Summarize(bel []float64, g Grid) Summary {
	maxBel := 0.0
	for _, b := range bel {
		maxBel = max(maxBel, b)
	}

	var s Summary
	var nTop int
	for i, b := range bel {
		x, y := g.Center(i)
		s.MeanX += b * x
		s.MeanY += b * y
		if b >= maxBel*(1-1e-9) {
			s.EstX += x
			s.EstY += y
			nTop++
		}
	}
	s.EstX /= float64(nTop)
	s.EstY /= float64(nTop)
	s.PMax = 100 * maxBel
	return s
}
