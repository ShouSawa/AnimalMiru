// repository/estimator_config.go
package repository

import (
	"fmt"

	"github.com/ShouSawa/AnimalMiru/backend/db"
	"github.com/ShouSawa/AnimalMiru/backend/estimator"
)

// LoadEstimator は estimator_config の1行と estimator_sensor の12行を読む．
// 格子が実装の前提（60×60，0.5 m，−15 m）と違う場合や map_encoding が1でない場合はエラーにする
func LoadEstimator(id int) (estimator.Params, estimator.Grid, [12]estimator.SensorCal, error) {
	var cal [12]estimator.SensorCal
	c, err := GetConfig(id)
	if err != nil {
		return estimator.Params{}, estimator.Grid{}, cal, fmt.Errorf("config_id=%d の設定を読めません: %w", id, err)
	}

	g := estimator.Grid{Nx: c.GridNx, Ny: c.GridNy, H: c.CellSizeM, X0: c.GridXMinM, Y0: c.GridYMinM}
	if g != estimator.DefaultGrid() || c.MapEncoding != 1 {
		return estimator.Params{}, g, cal, fmt.Errorf("未対応の設定です: grid=%+v map_encoding=%d", g, c.MapEncoding)
	}

	var sensors []struct {
		SensorNo   int     `db:"sensor_no"`
		NoiseFloor float64 `db:"noise_floor"`
		UpperLevel float64 `db:"upper_level"`
	}
	if err := db.DB.Select(&sensors, `
		SELECT sensor_no, noise_floor, upper_level FROM estimator_sensor WHERE config_id = $1
	`, id); err != nil {
		return estimator.Params{}, g, cal, err
	}
	if len(sensors) != len(cal) {
		return estimator.Params{}, g, cal, fmt.Errorf("estimator_sensor が%d行しかありません（12行必要）", len(sensors))
	}
	for _, s := range sensors {
		cal[s.SensorNo-1] = estimator.SensorCal{Noise: s.NoiseFloor, Upper: s.UpperLevel}
	}

	p := estimator.Params{
		WindowSec: c.WindowSec, DelaySec: c.DelaySec, MinSamples: c.MinSamples,
		ActiveThreshV: c.ActiveThreshV, FovHalfDeg: c.FovHalfDeg, RangeM: c.RangeM, D0M: c.D0M,
		SigmaObs: c.SigmaObs, Epsilon: c.Epsilon, Beta: c.Beta,
		SigmaMoveM: c.SigmaMoveM, QuietResetSec: c.QuietResetSec,
		NodeSpacingM: c.NodeSpacingM,
	}
	return p, g, cal, nil
}
