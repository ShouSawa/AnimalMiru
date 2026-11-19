// handler/estimation.go
package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/frame"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
)

const maxEstimationRangeSec = 600

// configIDParam はクエリの config_id を返す。省略時は main=true の config_id を返す
func configIDParam(q url.Values) (int, error) {
	if v := q.Get("config_id"); v != "" {
		return strconv.Atoi(v)
	}
	return repository.MainConfigID()
}

// ServeEstimation は /api/estimation?from=UNIX秒&to=UNIX秒[&config_id=N][&map=0] のHTTPハンドラを返す。
// ts が [from, to) の推定結果を ts の昇順で返す。config_id を省略したときは main=true の config_id を使う
func ServeEstimation() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		from, errFrom := strconv.ParseInt(q.Get("from"), 10, 64)
		to, errTo := strconv.ParseInt(q.Get("to"), 10, 64)
		if errFrom != nil || errTo != nil || to <= from || to-from > maxEstimationRangeSec {
			http.Error(w, "invalid from/to", http.StatusBadRequest)
			return
		}
		configID, err := configIDParam(q)
		if err != nil {
			log.Printf("推定に使う config_id を決められません: %v", err)
			http.Error(w, "invalid config_id", http.StatusBadRequest)
			return
		}
		withMap := q.Get("map") != "0"

		p, g, _, err := repository.LoadEstimator(configID)
		if err != nil {
			log.Printf("推定設定の取得失敗: %v", err)
			http.Error(w, "config not found", http.StatusNotFound)
			return
		}
		rows, err := repository.GetFrames(configID, time.Unix(from, 0), time.Unix(to, 0), withMap)
		if err != nil {
			log.Printf("推定結果の取得失敗: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		writeFrames(w, configID, rows, p.WindowSec, withMap, g.N())
	}
}

// writeFrames はDBの行を Frame にして {"config_id": N, "frames": [...]} で返す
func writeFrames(w http.ResponseWriter, configID int, rows []repository.EstimationRow, windowSec int, withMap bool, n int) {
	frames := make([]frame.Frame, 0, len(rows))
	for _, row := range rows {
		f, err := frame.FromRow(row, windowSec, withMap, n)
		if err != nil {
			log.Printf("推定結果の変換失敗 ts=%s: %v", row.Ts, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		frames = append(frames, f)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"config_id": configID, "frames": frames})
}
