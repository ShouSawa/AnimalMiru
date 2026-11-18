// estimator/params.go
package estimator

// Params は estimator_config の列に対応する推定の設定
type Params struct {
	WindowSec     int
	DelaySec      float64
	MinSamples    int
	ActiveThreshV float64
	FovHalfDeg    float64
	RangeM        float64
	D0M           float64
	SigmaObs      float64
	Epsilon       float64
	Beta          float64
	SigmaMoveM    float64
	QuietResetSec *int // nil なら無反応が続いてもリセットしない
}

// SensorCal はセンサごとの較正値．S_k と同じ単位（生の8bit幅，0〜255）
type SensorCal struct {
	Noise, Upper float64
}

// DefaultParams は estimator_config の既定値と同じ設定を返す
func DefaultParams() Params {
	quiet := 30
	return Params{
		WindowSec: 1, DelaySec: 3.0, MinSamples: 5, ActiveThreshV: 0.7,
		FovHalfDeg: 72, RangeM: 10, D0M: 8,
		SigmaObs: 0.3, Epsilon: 0.1, Beta: 0.7,
		SigmaMoveM: 2.0, QuietResetSec: &quiet,
	}
}
