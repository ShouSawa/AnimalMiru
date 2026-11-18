// estimator/result.go
package estimator

// Result は1秒窓の推定結果
type Result struct {
	Summary
	Radius90, Entropy float64
	Features
	MapZ []byte
}

// NewResult は更新後の信念と特徴量から結果をまとめる．
// 指標は uint8 に量子化する前の float64 の信念から求める
func NewResult(bel []float64, g Grid, ft Features) (Result, error) {
	z, err := EncodeMap(bel)
	if err != nil {
		return Result{}, err
	}
	s := Summarize(bel, g)
	return Result{
		Summary:  s,
		Radius90: Radius90(bel, g, s.EstX, s.EstY),
		Entropy:  Entropy(bel),
		Features: ft,
		MapZ:     z,
	}, nil
}
