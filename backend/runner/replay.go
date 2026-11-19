// runner/replay.go
package runner

import (
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

// PastWarmupSec は過去の窓を再計算するとき，その窓より何秒前から一様な信念で追いつくか
const PastWarmupSec = 30

// Replay は窓の開始 T の結果を，T の PastWarmupSec 秒前から一様な信念で1秒ずつ進めて求め，
// T が保存対象なら保存する（保存するのは T の行だけ．追いつくための秒は保存しない）．
// 常駐処理の Runner とは別の信念で動くので，リアルタイムの推定には影響しない．
// T が保存対象でないときと，同じ（config_id，ts）が既にあったときは何も保存しない
func Replay(deps Deps, configID int, g estimator.Grid, p estimator.Params, cal [12]estimator.SensorCal, lastEventID int, T time.Time) error {
	start := T.Add(-PastWarmupSec * time.Second)
	end := T.Add(time.Duration(p.WindowSec) * time.Second)

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
	for t := start; t.Before(T); t = t.Add(time.Second) {
		if _, _, err := r.compute(t); err != nil {
			return err
		}
	}
	row, ok, err := r.compute(T)
	if err != nil || !ok {
		return err
	}
	_, err = deps.SaveResult(row)
	return err
}
