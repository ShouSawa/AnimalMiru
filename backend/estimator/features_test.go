// estimator/features_test.go
package estimator

import "testing"

func calAll(noise, upper float64) (cal [12]SensorCal) {
	for k := range cal {
		cal[k] = SensorCal{noise, upper}
	}
	return
}

// 第13.4節: n=20，u=120 での s_k
func TestFeaturesS(t *testing.T) {
	cases := []struct{ span, want float64 }{{10, 0}, {20, 0}, {70, 0.5}, {120, 1}, {200, 1}}
	for _, c := range cases {
		var stats [12]*Stat
		stats[0] = &Stat{Count: 10, Min: 100, Max: 100 + int(c.span)}
		ft := BuildFeatures(stats, calAll(20, 120), DefaultParams())
		near(t, "s", *ft.S[0], c.want, 1e-12)
	}
}

// active_thresh_v=0.7 は S ≥ 35.7（S=35 は false，S=36 は true）
func TestFeaturesActive(t *testing.T) {
	for span, want := range map[int]bool{35: false, 36: true} {
		var stats [12]*Stat
		stats[0] = &Stat{Count: 10, Min: 100, Max: 100 + span}
		if got := BuildFeatures(stats, calAll(20, 120), DefaultParams()).Active; got != want {
			t.Errorf("S=%d: active=%v, want %v", span, got, want)
		}
	}
}

// サンプル数が min_samples 未満のセンサは欠測．ただしノードのビットには含める
func TestFeaturesMissing(t *testing.T) {
	var stats [12]*Stat
	stats[0] = &Stat{Count: 4, Min: 0, Max: 200}
	stats[9] = &Stat{Count: 10, Min: 0, Max: 100}
	ft := BuildFeatures(stats, calAll(20, 120), DefaultParams())
	if ft.S[0] != nil || ft.NSensors != 1 || len(ft.Obs) != 1 || ft.Obs[0].K != 9 {
		t.Errorf("欠測の扱いが不正: %+v", ft)
	}
	if ft.NodeMask != 1|8 {
		t.Errorf("node_mask=%d, want 9", ft.NodeMask)
	}
	near(t, "active_sum", ft.ActiveSum, 0.8, 1e-12)
}

func TestSensorNo(t *testing.T) {
	cases := []struct {
		node, sensor string
		want         int
	}{{"0002", "A1", 1}, {"0003", "A2", 5}, {"0005", "A3", 12}, {"0009", "A1", -1}, {"0002", "A4", -1}}
	for _, c := range cases {
		if got := SensorNo(c.node, c.sensor); got != c.want {
			t.Errorf("%s-%s: %d, want %d", c.node, c.sensor, got, c.want)
		}
	}
}

// 第4章: センサの向きが設計書の表と一致する
func TestSensorAngles(t *testing.T) {
	want := [12]float64{225, 345, 105, 135, 255, 15, 45, 165, 285, 315, 75, 195}
	for k, s := range Sensors {
		if s.AngleDeg != want[k] {
			t.Errorf("センサ%d: %v, want %v", k+1, s.AngleDeg, want[k])
		}
	}
}
