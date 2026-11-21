// runner/replay.go
package runner

import (
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

// PastWarmupSec は過去の窓を再計算するとき，その窓より何秒前から一様な信念で追いつくか
const PastWarmupSec = 30

// Replay は窓の開始 T の結果を求め，T が保存対象なら保存する．詳細は ReplayRange を参照
func Replay(deps Deps, configID int, g estimator.Grid, p estimator.Params, cal [12]estimator.SensorCal, lastEventID int, T time.Time) error {
	return ReplayRange(deps, configID, g, p, cal, lastEventID, T, T.Add(time.Second))
}

// ReplayRange は窓の開始が [from, to) の各秒の結果を，from の PastWarmupSec 秒前から
// 一様な信念で1秒ずつ進めて求め，保存対象の秒を保存する（追いつくための秒は保存しない）．
// 同じ（config_id，ts）が既にある秒は保存せず，DBの結果をそのまま残す．
// 常駐処理の Runner とは別の信念で動くので，リアルタイムの推定には影響しない
func ReplayRange(deps Deps, configID int, g estimator.Grid, p estimator.Params, cal [12]estimator.SensorCal, lastEventID int, from, to time.Time) error {
	start := from.Add(-PastWarmupSec * time.Second)
	end := to.Add(time.Duration(p.WindowSec-1) * time.Second)

	// 追いつく間の全秒分を1回で読み，秒ごとの検索はメモリ上で行う
	all, err := deps.GetRows(samples.QueryRange(start, end))
	if err != nil {
		return err
	}
	local := deps
	local.GetRows = func(from, to time.Time) ([]samples.Row, error) {
		var rows []samples.Row
		for _, r := range all {
			if !r.NodeTs.Before(from) && r.NodeTs.Before(to) {
				rows = append(rows, r)
			}
		}
		return rows, nil
	}

	r := New(local, configID, g, p, cal, lastEventID)
	for t := start; t.Before(to); t = t.Add(time.Second) {
		row, ok, err := r.compute(t)
		if err != nil {
			return err
		}
		if !ok || t.Before(from) {
			continue
		}
		if _, err := deps.SaveResult(row); err != nil {
			return err
		}
	}
	return nil
}
