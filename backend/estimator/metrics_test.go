// estimator/metrics_test.go
package estimator

import "testing"

// 第13.1節: 中心 (0.25, 0.25) のガウスの p_max，エントロピー，radius90
func TestMetricsGauss(t *testing.T) {
	g := DefaultGrid()
	cases := []struct {
		name         string
		bel          []float64
		pMax, h, r90 float64
	}{
		{"一様", g.Uniform(), 0.028, 11.814, 16.711},
		{"σ=0.5", gaussBel(g, 0.5, [2]float64{0.25, 0.25}), 15.915, 4.094, 1.118},
		{"σ=1", gaussBel(g, 1, [2]float64{0.25, 0.25}), 3.979, 6.094, 2.121},
		{"σ=2", gaussBel(g, 2, [2]float64{0.25, 0.25}), 0.995, 8.094, 4.272},
		{"σ=3", gaussBel(g, 3, [2]float64{0.25, 0.25}), 0.442, 9.264, 6.500},
		{"σ=5", gaussBel(g, 5, [2]float64{0.25, 0.25}), 0.160, 10.692, 10.607},
	}
	for _, c := range cases {
		near(t, c.name+" p_max", Summarize(c.bel, g).PMax, c.pMax, 1e-3)
		near(t, c.name+" H", Entropy(c.bel), c.h, 1e-3)
		near(t, c.name+" r90", Radius90(c.bel, g, 0.25, 0.25), c.r90, 1e-3)
	}
}

// 二峰の信念では est（最大点）を中心にした radius90 が事後平均を中心にした場合と違う
func TestMetricsTwoPeaks(t *testing.T) {
	g := DefaultGrid()
	bel := gaussBel(g, 1, [2]float64{-4.25, 0.25}, [2]float64{3.75, 0.25})
	near(t, "p_max", Summarize(bel, g).PMax, 1.989, 1e-3)
	near(t, "H", Entropy(bel), 7.094, 1e-3)
	near(t, "r90(est中心)", Radius90(bel, g, -4.25, 0.25), 9.014, 1e-3)
	near(t, "r90(平均中心)", Radius90(bel, g, -0.25, 0.25), 5.500, 1e-3)
}

func TestMapCodec(t *testing.T) {
	g := DefaultGrid()
	bel := gaussBel(g, 2, [2]float64{0.25, 0.25})
	z, err := EncodeMap(bel)
	if err != nil {
		t.Fatal(err)
	}
	if len(z) > 2400 {
		t.Errorf("圧縮後 %d バイト（約2.3KB以下のはず）", len(z))
	}
	q, err := DecodeMap(z, g.N())
	if err != nil {
		t.Fatal(err)
	}
	maxBel, maxQ := 0.0, uint8(0)
	for i, b := range bel {
		maxBel = max(maxBel, b)
		maxQ = max(maxQ, q[i])
	}
	if maxQ != 255 {
		t.Errorf("最大セルは255のはず: %d", maxQ)
	}
	for i, b := range bel {
		if want := 255 * b / maxBel; float64(q[i]) < want-0.5-1e-9 || float64(q[i]) > want+0.5+1e-9 {
			t.Fatalf("i=%d: q=%d, want round(%.3f)", i, q[i], want)
		}
	}
	if _, err := DecodeMap(z, g.N()+1); err == nil {
		t.Error("長さ不一致はエラーのはず")
	}
}
