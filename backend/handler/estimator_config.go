// handler/estimator_config.go
package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/lib/pq"
)

// validateConfig は実装が対応している設定かを調べる（そのほかの範囲はDBのCHECK制約が検査する）
func validateConfig(c repository.EstimatorConfig) error {
	g := estimator.Grid{Nx: c.GridNx, Ny: c.GridNy, H: c.CellSizeM, X0: c.GridXMinM, Y0: c.GridYMinM}
	if g != estimator.DefaultGrid() {
		return fmt.Errorf("格子は 60×60，0.5 m，西端・南端 −15 m のみ対応しています")
	}
	if c.MapEncoding != 1 {
		return fmt.Errorf("map_encoding は 1 のみ対応しています")
	}
	if len(c.Sensors) != 12 {
		return fmt.Errorf("センサは12個分の値が必要です")
	}
	return nil
}

// ServeEstimatorConfigs は /api/estimator/configs のHTTPハンドラを返す。
// GET: 全設定と使用中の config_id を返す
// POST {"config": {..., "sensors": [12センサ分]}}: 設定を追加して使用中にする。同じ設定が既にあればそれを使用中にする
func ServeEstimatorConfigs(active func() int, activate func(int) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			configs, err := repository.ListConfigs()
			if err != nil {
				log.Printf("推定設定の一覧取得失敗: %v", err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{"active_config_id": active(), "configs": configs})
		case http.MethodPost:
			var req struct {
				Config repository.EstimatorConfig `json:"config"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid body", http.StatusBadRequest)
				return
			}
			if err := validateConfig(req.Config); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			id, created, err := repository.CreateConfig(req.Config)
			var pqErr *pq.Error
			if errors.As(err, &pqErr) && pqErr.Code.Class() == "23" { // 制約違反は入力の誤り
				http.Error(w, pqErr.Message, http.StatusBadRequest)
				return
			}
			if err != nil {
				log.Printf("推定設定の追加失敗: %v", err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}
			if err := activate(id); err != nil {
				log.Printf("推定設定の切替失敗 config_id=%d: %v", id, err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{"config_id": id, "created": created})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}
