// handler/query.go
package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
)

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
