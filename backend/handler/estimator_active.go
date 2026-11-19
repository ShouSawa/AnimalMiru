// handler/estimator_active.go
package handler

import (
	"encoding/json"
	"log"
	"net/http"
)

// ServeEstimatorActive は POST /api/estimator/active {"config_id": N} のHTTPハンドラを返す。
// 以降の経路推定を config_id の設定で行う（信念は一様から再開する）
func ServeEstimatorActive(activate func(int) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ConfigID int `json:"config_id"`
		}
		if r.Method != http.MethodPost || json.NewDecoder(r.Body).Decode(&req) != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		if err := activate(req.ConfigID); err != nil {
			log.Printf("推定設定の切替失敗 config_id=%d: %v", req.ConfigID, err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
