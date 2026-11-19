// runner/row.go
package runner

import (
	"math"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
)

// buildRow は結果をDBの1行にする．update_type は1（保存する行は必ず観測で更新している）
func buildRow(configID int, ts, computedAt time.Time, eventID int, res estimator.Result) repository.EstimationRow {
	row := repository.EstimationRow{
		ConfigID: configID, Ts: ts, UpdateType: 1, NodeMask: res.NodeMask, Active: res.Active,
		EstX: res.EstX, EstY: res.EstY, MeanX: res.MeanX, MeanY: res.MeanY,
		PMax: res.PMax, Radius90: res.Radius90, Entropy: res.Entropy,
		NSensors: res.NSensors, ActiveSum: res.ActiveSum,
		MapZ: res.MapZ, ComputedAt: computedAt, EventID: eventID,
	}
	for k, s := range res.S {
		if s != nil {
			v := int16(math.Round(100 * *s))
			row.S[k] = &v
		}
	}
	return row
}
