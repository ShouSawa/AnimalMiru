// handler/route.go
package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
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

// ServeRoutes は /api/routes のHTTPハンドラを返す。
// GET: 正解経路の一覧 / POST: 保存（同じタイトルは上書き） / DELETE ?id=番号: 削除
func ServeRoutes() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getRoutes(w)
		case http.MethodPost:
			postRoute(w, r)
		case http.MethodDelete:
			deleteRoute(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func getRoutes(w http.ResponseWriter) {
	routes, err := repository.ListRoutes()
	if err != nil {
		log.Printf("正解経路の取得失敗: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"routes": routes})
}

func postRoute(w http.ResponseWriter, r *http.Request) {
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

	id, overwritten, err := repository.SaveRoute(route)
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
	json.NewEncoder(w).Encode(map[string]any{"route_id": id, "overwritten": overwritten})
}

func deleteRoute(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.URL.Query().Get("id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := repository.DeleteRoute(id); err != nil {
		log.Printf("正解経路の削除失敗: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
