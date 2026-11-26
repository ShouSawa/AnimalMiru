// handler/route.go
package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/lib/pq"
)

// validateRoute はDBの制約では調べられない内容を検査する
func validateRoute(r repository.Route) error {
	if r.Title == "" {
		return fmt.Errorf("タイトルを入力してください")
	}
	if len(r.Waypoints) == 0 {
		return fmt.Errorf("通過点がありません")
	}
	g := estimator.DefaultGrid()
	prevSec := -1
	for i, p := range r.Waypoints {
		ix, iy, sec := p[0], p[1], p[2]
		if ix < 0 || ix >= g.Nx || iy < 0 || iy >= g.Ny {
			return fmt.Errorf("通過点%dのセルが範囲外です", i+1)
		}
		if sec <= prevSec {
			return fmt.Errorf("通過点%dの時刻は前の点より後にしてください", i+1)
		}
		prevSec = sec
	}
	return nil
}

// ServeRoutes は POST /api/routes のHTTPハンドラを返す。正解経路を1件保存して route_id を返す
func ServeRoutes() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var route repository.Route
		if err := json.NewDecoder(r.Body).Decode(&route); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		route.Title = strings.TrimSpace(route.Title)
		if err := validateRoute(route); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		id, err := repository.CreateRoute(route)
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code.Class() == "23" { // 制約違反は入力の誤り
			http.Error(w, pqErr.Message, http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Printf("正解経路の保存失敗: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"route_id": id})
	}
}
