// estimator/radius90.go
package estimator

import (
	"math"
	"sort"
)

const (
	radiusProb = 0.9
	radiusMin  = 0.25 // 下限[m]（半セル）
)

// Radius90 は (cx, cy) を中心に，累積確率が初めて90%に達する半径[m]を返す．
// セルを中心から近い順に並べ，隣り合う距離の間で線形補間する
func Radius90(bel []float64, g Grid, cx, cy float64) float64 {
	dist := make([]float64, len(bel))
	order := make([]int, len(bel))
	for i := range bel {
		x, y := g.Center(i)
		dist[i] = math.Hypot(x-cx, y-cy)
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return dist[order[a]] < dist[order[b]] })

	prevC, prevD := 0.0, 0.0
	for m, i := range order {
		c := prevC + bel[i]
		if c >= radiusProb {
			r := dist[i]
			if m > 0 {
				r = prevD + (dist[i]-prevD)*(radiusProb-prevC)/(c-prevC)
			}
			return math.Max(r, radiusMin)
		}
		prevC, prevD = c, dist[i]
	}
	return math.Max(prevD, radiusMin)
}
