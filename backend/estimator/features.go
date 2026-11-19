// estimator/features.go
package estimator

import "math"

// Stat は1秒窓の1センサのサンプル数と最小・最大（生の8bit値）
type Stat struct {
	Count, Min, Max int
}

// Features は1秒窓の特徴量
type Features struct {
	Obs       []Obs        // 使えたセンサ（欠測を除く）の観測
	S         [12]*float64 // センサごとの s_k（0〜1）．欠測は nil
	Active    bool
	ActiveSum float64
	NSensors  int
	NodeMask  int // 窓内にサンプルが届いたノードのビット和（1=0002，2=0003，4=0004，8=0005）
}

// BuildFeatures は窓の統計 stats（データが無いセンサは nil）から特徴量を作る
func BuildFeatures(stats [12]*Stat, cal [12]SensorCal, p Params) Features {
	var ft Features
	for k, st := range stats {
		if st == nil {
			continue
		}
		ft.NodeMask |= 1 << (k / 3)
		if st.Count < p.MinSamples {
			continue
		}
		span := float64(st.Max - st.Min)
		if span/255*5 >= p.ActiveThreshV {
			ft.Active = true
		}
		s := math.Min(math.Max((span-cal[k].Noise)/(cal[k].Upper-cal[k].Noise), 0), 1)
		ft.S[k] = &s
		ft.Obs = append(ft.Obs, Obs{K: k, S: s})
		ft.ActiveSum += s
		ft.NSensors++
	}
	return ft
}
