// handler/query.go
package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
)

var jst = time.FixedZone("JST", 9*60*60)

// ServeAvailability は /api/sensor-data/availability のHTTPハンドラを返す。
// 設定エリアのカレンダー・時計で、データがある日時を色付けするために使う。
// date未指定: データがある日付の一覧 / date=YYYY-MM-DD: その日にデータがある時刻（0時からの秒数）の一覧
func ServeAvailability() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var result map[string]any
		if v := r.URL.Query().Get("date"); v != "" {
			dayStart, err := time.ParseInLocation("2006-01-02", v, jst)
			if err != nil {
				http.Error(w, "invalid date", http.StatusBadRequest)
				return
			}
			seconds, err := repository.GetDataSecondsOfDay(dayStart)
			if err != nil {
				log.Printf("データ時刻一覧取得失敗: %v", err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}
			result = map[string]any{"seconds": seconds}
		} else {
			dates, err := repository.GetDataDates()
			if err != nil {
				log.Printf("データ日付一覧取得失敗: %v", err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}
			result = map[string]any{"dates": dates}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// ServeSeries は /api/sensor-data/series?from=UNIX秒&to=UNIX秒 のHTTPハンドラを返す。
// ホーム画面のセンサグラフに、指定期間の値を描くために使う
func ServeSeries() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		from, errFrom := strconv.ParseInt(r.URL.Query().Get("from"), 10, 64)
		to, errTo := strconv.ParseInt(r.URL.Query().Get("to"), 10, 64)
		if errFrom != nil || errTo != nil || to <= from {
			http.Error(w, "invalid from/to", http.StatusBadRequest)
			return
		}

		series, err := repository.GetSeries(time.Unix(from, 0), time.Unix(to, 0))
		if err != nil {
			log.Printf("グラフ用データ取得失敗: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"series": series})
	}
}

// ServeRecentLogs は /api/sensor-data/recent のHTTPハンドラを返す。
// DB画面を開いた直後に、これまでDBに保存済みのデータを表示するために使う
// （WebSocketはこの後の新着データのみを配信するため）
func ServeRecentLogs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 200
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				limit = n
			}
		}

		logs, err := repository.GetRecentLogs(limit)
		if err != nil {
			log.Printf("直近データ取得失敗: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"sensor_data": logs})
	}
}
