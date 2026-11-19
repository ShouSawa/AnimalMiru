// estimator/filter.go
package estimator

// Filter は信念と無反応の秒数を持ち，1秒ずつ進める
type Filter struct {
	g     Grid
	p     Params
	exp   [][]float64
	ker   []float64
	bel   []float64
	quiet int
}

// NewFilter は一様な信念から始まるフィルタを作る．期待反応の表とカーネルはここで1回だけ作る
func NewFilter(g Grid, p Params) *Filter {
	return &Filter{
		g:   g,
		p:   p,
		exp: Expected(g, p),
		ker: Kernel(p.SigmaMoveM / g.H),
		bel: g.Uniform(),
	}
}

// Reset は信念を一様に戻す
func (f *Filter) Reset() {
	f.bel = f.g.Uniform()
	f.quiet = 0
}

// Step は1秒を進め，更新後の信念と保存対象かどうかを返す．
// 無反応が QuietResetSec 秒続いたら一様に戻し，使えるセンサが無い秒は予測のみ行う
func (f *Filter) Step(ft Features) (bel []float64, save bool) {
	if f.p.QuietResetSec != nil && f.quiet >= *f.p.QuietResetSec {
		f.Reset()
	}
	f.bel = Predict(f.bel, f.g, f.ker)
	if len(ft.Obs) == 0 {
		f.quiet++
		return f.bel, false
	}
	f.bel = Update(f.bel, ft.Obs, f.exp, f.p)
	if ft.Active {
		f.quiet = 0
		return f.bel, true
	}
	f.quiet++
	return f.bel, false
}
