// handler/estimation_recalc_range.go
package handler

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/runner"
)

const maxRecalcRangeSec = 3600

// ServeEstimationRecalcRange は POST /api/estimation/recalc-range?from=UNIX秒&to=UNIX秒[&config_id=N] のHTTPハンドラを返す。
// ts が [from, to) の各秒の推定結果を計算して保存する（範囲経路計算）。既にDBにある秒は保存済みの結果を残す。
// 結果は /api/estimation で1秒ずつ取得する。常駐処理に任せる最新の窓（recalc と同じ境界）以降は計算しない
func ServeEstimationRecalcRange() http.HandlerFunc {
	deps := runner.Deps{GetRows: repository.GetRows, SaveResult: repository.SaveResult, Now: time.Now}
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		from, errFrom := strconv.ParseInt(q.Get("from"), 10, 64)
		to, errTo := strconv.ParseInt(q.Get("to"), 10, 64)
		if r.Method != http.MethodPost || errFrom != nil || errTo != nil || to <= from || to-from > maxRecalcRangeSec {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		configID, err := configIDParam(q)
		if err != nil {
			log.Printf("推定に使う config_id を決められません: %v", err)
			http.Error(w, "invalid config_id", http.StatusBadRequest)
			return
		}

		p, g, cal, err := repository.LoadEstimator(configID)
		if err != nil {
			log.Printf("推定設定の取得失敗: %v", err)
			http.Error(w, "config not found", http.StatusNotFound)
			return
		}

		// 窓の計算に必要なデータが揃う最新の窓までに切り詰める
		end := time.Unix(to, 0)
		if latest := runner.TargetStart(time.Now(), p.WindowSec, p.DelaySec).Add(time.Second); latest.Before(end) {
			end = latest
		}
		if end.After(time.Unix(from, 0)) {
			lastEventID, err := repository.MaxEventID(configID)
			if err == nil {
				err = runner.ReplayRange(deps, configID, g, p, cal, lastEventID, time.Unix(from, 0), end)
			}
			if err != nil {
				log.Printf("範囲の推定結果の計算失敗 from=%d to=%d: %v", from, to, err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
