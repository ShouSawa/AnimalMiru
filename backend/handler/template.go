// handler/template.go
package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
)

// ServeTemplates は /api/templates のHTTPハンドラを返す。
// GET: テンプレート名の一覧 / GET ?name=テンプレート名: その1件 / POST: 保存（同名は上書き）
func ServeTemplates() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getTemplates(w, r)
		case http.MethodPost:
			postTemplate(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func getTemplates(w http.ResponseWriter, r *http.Request) {
	var result any
	var err error
	if name := r.URL.Query().Get("name"); name != "" {
		result, err = repository.GetTemplate(name)
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "template not found", http.StatusNotFound)
			return
		}
	} else {
		var names []string
		names, err = repository.GetTemplateNames()
		result = map[string]any{"names": names}
	}
	if err != nil {
		log.Printf("テンプレート取得失敗: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func postTemplate(w http.ResponseWriter, r *http.Request) {
	var t repository.DataTemplate
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil || strings.TrimSpace(t.Name) == "" {
		http.Error(w, "invalid template", http.StatusBadRequest)
		return
	}

	if err := repository.SaveTemplate(t); err != nil {
		log.Printf("テンプレート保存失敗: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
