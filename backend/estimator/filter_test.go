// estimator/filter_test.go
package estimator

import "testing"

const targetCell = 2076 // セル中心 (3.25, 2.25)

// targetObs は雑音なしで観測 s_k = e_k(targetCell) とした12センサ全部の観測
func targetObs(exp [][]float64) []Obs {
	obs := make([]Obs, len(exp))
	for k := range exp {
		obs[k] = Obs{K: k, S: exp[k][targetCell]}
	}
	return obs
}

type metrics struct{ estX, estY, meanX, meanY, pMax, r90, h float64 }

func measure(bel []float64, g Grid) metrics {
	s := Summarize(bel, g)
	return metrics{s.EstX, s.EstY, s.MeanX, s.MeanY, s.PMax, Radius90(bel, g, s.EstX, s.EstY), Entropy(bel)}
}

func checkMetrics(t *testing.T, name string, got, want metrics) {
	t.Helper()
	near(t, name+" est_x", got.estX, want.estX, 1e-5)
	near(t, name+" est_y", got.estY, want.estY, 1e-5)
	near(t, name+" mean_x", got.meanX, want.meanX, 1e-5)
	near(t, name+" mean_y", got.meanY, want.meanY, 1e-5)
	near(t, name+" p_max", got.pMax, want.pMax, 1e-5)
	near(t, name+" radius90", got.r90, want.r90, 1e-5)
	near(t, name+" H", got.h, want.h, 1e-5)
}

// 第13.3節のゴールデンテスト: 3回（予測→更新）してから予測のみ1回
func TestFilterGolden(t *testing.T) {
	g, p := DefaultGrid(), DefaultParams()
	f := NewFilter(g, p)
	obs := targetObs(f.exp)
	for k, want := range map[int]float64{0: 0.847033, 3: 0.419312, 9: 0.306775} {
		near(t, "s_k", obs[k].S, want, 1e-6)
	}

	want := []metrics{
		{3.25, 2.25, 0.961365, 0.760121, 0.390995, 18.384776, 10.855614},
		{2.75, 2.25, 2.094041, 1.727251, 1.092161, 14.422205, 8.751040},
		{2.75, 2.25, 2.504880, 2.092337, 1.366984, 3.756351, 7.706547},
		{2.75, 2.25, 2.504869, 2.092330, 0.583923, 5.955209, 9.066963},
	}
	for step, w := range want {
		ft := Features{Obs: obs, Active: true}
		if step == 3 {
			ft = Features{} // 使えるセンサ無し: 予測のみ
		}
		bel, _ := f.Step(ft)
		checkMetrics(t, "ステップ"+string(rune('1'+step)), measure(bel, g), w)
	}
}

func TestFilterPartial(t *testing.T) {
	g, p := DefaultGrid(), DefaultParams()
	f := NewFilter(g, p)
	obs := targetObs(f.exp)

	bel, _ := f.Step(Features{Obs: obs[:3], Active: true}) // センサ1〜3（0002）だけ
	checkMetrics(t, "0002のみ", measure(bel, g),
		metrics{3.0, 3.0, -0.432092, -0.432092, 0.115922, 18.141803, 11.583828})

	f = NewFilter(g, p)
	zero := make([]Obs, 12)
	for k := range zero {
		zero[k].K = k
	}
	bel, _ = f.Step(Features{Obs: zero, Active: true}) // 12個すべて s=0
	checkMetrics(t, "全s=0", measure(bel, g),
		metrics{0, 0, 0, 0, 0.065472, 18.155578, 11.371587})
}

// 視野内のセル数
func TestExpectedInsideCount(t *testing.T) {
	exp := Expected(DefaultGrid(), DefaultParams())
	for k, want := range map[int]int{0: 502, 5: 506, 11: 506} {
		n := 0
		for _, e := range exp[k] {
			if e > 0 {
				n++
			}
		}
		if n != want {
			t.Errorf("センサ%d: 視野内 %d セル, want %d", k+1, n, want)
		}
	}
}

// 第6.3節: 保存対象の判定，無反応リセット，使えるセンサ無しの扱い
func TestFilterQuietAndSave(t *testing.T) {
	g, p := DefaultGrid(), DefaultParams()
	quiet := 3
	p.QuietResetSec = &quiet
	f := NewFilter(g, p)
	obs := targetObs(f.exp)

	if _, save := f.Step(Features{Obs: obs, Active: true}); !save {
		t.Error("active なら保存対象のはず")
	}
	if _, save := f.Step(Features{Obs: obs, Active: false}); save {
		t.Error("active でなければ保存しないはず")
	}
	f.Step(Features{}) // quiet=2
	f.Step(Features{}) // quiet=3
	bel, _ := f.Step(Features{})
	if d := measure(bel, g); d.pMax > 0.0285 {
		t.Errorf("無反応が続いたら一様に戻るはず: p_max=%v", d.pMax)
	}

	p.QuietResetSec = nil
	f = NewFilter(g, p)
	f.Step(Features{Obs: obs, Active: true})
	for range 100 {
		f.Step(Features{})
	}
	if f.quiet != 100 {
		t.Errorf("QuietResetSec=nil ならリセットしないはず: quiet=%d", f.quiet)
	}
}
