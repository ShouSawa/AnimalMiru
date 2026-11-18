// estimator/kernel.go
package estimator

import "math"

// Kernel は標準偏差 sigmaCells[セル] の1次元ガウスカーネルを返す．
// 半径は ceil(3σ)，長さは 2×半径+1，合計は1に正規化する
func Kernel(sigmaCells float64) []float64 {
	r := int(math.Ceil(3 * sigmaCells))
	ker := make([]float64, 2*r+1)
	sum := 0.0
	for k := range ker {
		d := float64(k - r)
		ker[k] = math.Exp(-d * d / (2 * sigmaCells * sigmaCells))
		sum += ker[k]
	}
	for k := range ker {
		ker[k] /= sum
	}
	return ker
}
