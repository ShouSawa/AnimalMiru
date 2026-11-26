// estimator/expected.go
package estimator

import "math"

// Expected は期待反応 e_k(i) の表 [12][N] を作る．
// 視野内（角度差が FovHalfDeg 以内かつ距離が RangeM 以内）なら exp(-(d/D0)^2)，視野外は0
func Expected(g Grid, p Params) [][]float64 {
	sensors := Sensors(p.NodeSpacingM)
	table := make([][]float64, len(sensors))
	for k, s := range sensors {
		table[k] = make([]float64, g.N())
		for i := range table[k] {
			cx, cy := g.Center(i)
			dx, dy := cx-s.X, cy-s.Y
			d := math.Hypot(dx, dy)
			delta := wrapDeg(math.Atan2(dy, dx)*180/math.Pi - s.AngleDeg)
			if math.Abs(delta) <= p.FovHalfDeg && d <= p.RangeM {
				table[k][i] = math.Exp(-(d / p.D0M) * (d / p.D0M))
			}
		}
	}
	return table
}

// wrapDeg は角度を −180°〜180° に折り返す
func wrapDeg(a float64) float64 {
	a = math.Mod(a, 360)
	if a > 180 {
		a -= 360
	} else if a < -180 {
		a += 360
	}
	return a
}
