// handler/estimation_recalc.go
package handler

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/runner"
)

// ServeEstimationRecalc は POST /api/estimation/recalc?ts=UNIX秒[&config_id=N] のHTTPハンドラを返す（過去データの確認用）。
// 窓の開始が ts の推定結果を返す。まず estimation_result を調べ、無いときだけ ts の PastWarmupSec 秒前から
// 一様な信念で再計算して保存する。保存対象でない秒（反応なし）は frames が空になる。
// 窓の計算に必要なデータが揃う前の時刻（今の窓に近い時刻）は、常駐処理に任せて再計算しない
func ServeEstimationRecalc(active func() int) http.HandlerFunc {
	deps := runner.Deps{GetRows: repository.GetRows, SaveResult: repository.SaveResult, Now: time.Now}
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		ts, err := strconv.ParseInt(q.Get("ts"), 10, 64)
		if r.Method != http.MethodPost || err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		configID := active()
		if v := q.Get("config_id"); v != "" {
			id, err := strconv.Atoi(v)
			if err != nil {
				http.Error(w, "invalid config_id", http.StatusBadRequest)
				return
			}
			configID = id
		}

		p, g, cal, err := repository.LoadEstimator(configID)
		if err != nil {
			log.Printf("推定設定の取得失敗: %v", err)
			http.Error(w, "config not found", http.StatusNotFound)
			return
		}

		T := time.Unix(ts, 0)
		rows, err := repository.GetFrames(configID, T, T.Add(time.Second), true)
		if err == nil && len(rows) == 0 && !T.After(runner.TargetStart(time.Now(), p.WindowSec, p.DelaySec)) {
			rows, err = recalc(deps, configID, g, p, cal, T)
		}
		if err != nil {
			log.Printf("過去の推定結果の取得失敗 ts=%d: %v", ts, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		writeFrames(w, configID, rows, p.WindowSec, true, g.N())
	}
}

// recalc は T の窓を再計算して保存し，保存された行を返す（反応なしなら空）
func recalc(deps runner.Deps, configID int, g estimator.Grid, p estimator.Params, cal [12]estimator.SensorCal, T time.Time) ([]repository.EstimationRow, error) {
	lastEventID, err := repository.MaxEventID(configID)
	if err != nil {
		return nil, err
	}
	if err := runner.Replay(deps, configID, g, p, cal, lastEventID, T); err != nil {
		return nil, err
	}
	return repository.GetFrames(configID, T, T.Add(time.Second), true)
}
