// estimator/grid.go
package estimator

// Grid は格子の定義．セルの添字は i = iy*Nx + ix（ixは西→東，iyは南→北）
type Grid struct {
	Nx, Ny int
	H      float64 // 1セルの一辺[m]
	X0, Y0 float64 // 西端・南端[m]
}

// DefaultGrid は30m四方を0.5mのセル60×60に分けた格子
func DefaultGrid() Grid {
	return Grid{Nx: 60, Ny: 60, H: 0.5, X0: -15, Y0: -15}
}

// N はセルの総数
func (g Grid) N() int {
	return g.Nx * g.Ny
}

// Center はセル i の中心座標[m]
func (g Grid) Center(i int) (x, y float64) {
	return g.X0 + (float64(i%g.Nx)+0.5)*g.H, g.Y0 + (float64(i/g.Nx)+0.5)*g.H
}

// Uniform はすべてのセルが等確率の信念を返す
func (g Grid) Uniform() []float64 {
	bel := make([]float64, g.N())
	for i := range bel {
		bel[i] = 1 / float64(g.N())
	}
	return bel
}
