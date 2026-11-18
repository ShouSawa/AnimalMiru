// estimator/update.go
package estimator

import (
	"log"
	"math"
)

// Obs は1センサの観測．K はセンサの添字（0〜11），S は反応の強さ（0〜1）
type Obs struct {
	K int
	S float64
}

// Update は予測後の信念 bel に観測 obs を反映して正規化した信念を返す（積形式の尤度）．
// 合計が0または非有限になったら更新を捨てて bel をそのまま返す
func Update(bel []float64, obs []Obs, exp [][]float64, p Params) []float64 {
	out := make([]float64, len(bel))
	sum := 0.0
	for i := range bel {
		v := bel[i]
		for _, o := range obs {
			d := o.S - exp[o.K][i]
			lik := (1-p.Epsilon)*math.Exp(-d*d/(2*p.SigmaObs*p.SigmaObs)) + p.Epsilon
			v *= math.Pow(lik, p.Beta)
		}
		out[i] = v
		sum += v
	}
	if sum <= 0 || math.IsNaN(sum) || math.IsInf(sum, 0) {
		log.Printf("推定: 更新後の確率の合計が不正（%v）．更新を捨てます", sum)
		return bel
	}
	for i := range out {
		out[i] /= sum
	}
	return out
}
