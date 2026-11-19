// frame/from_row.go
package frame

import (
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
)

func unixSec(t time.Time) float64 {
	return float64(t.UnixMilli()) / 1000
}

// FromRow はDBの行を Frame に変換する．withMap なら map_z を展開して n セル分の map_q にする
func FromRow(r repository.EstimationRow, windowSec int, withMap bool, n int) (Frame, error) {
	f := Frame{
		Ts: unixSec(r.Ts), WindowSec: windowSec, Active: r.Active, UpdateType: r.UpdateType,
		NodeMask: r.NodeMask, EstX: r.EstX, EstY: r.EstY, MeanX: r.MeanX, MeanY: r.MeanY,
		PMax: r.PMax, Radius90: r.Radius90, Entropy: r.Entropy,
		NSensors: r.NSensors, ActiveSum: r.ActiveSum, S: r.S,
		EventID: r.EventID, ComputedAt: unixSec(r.ComputedAt),
	}
	if withMap && r.MapZ != nil {
		q, err := estimator.DecodeMap(r.MapZ, n)
		if err != nil {
			return Frame{}, err
		}
		f.MapQ = make([]int, len(q))
		for i, v := range q {
			f.MapQ[i] = int(v)
		}
	}
	return f, nil
}
