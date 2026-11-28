// repository/route.go
package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/db"
)

// Route は正解経路1件分。Waypoints は [ix, iy, 開始からの秒] を通過順に並べたもの
type Route struct {
	RouteID     int      `json:"route_id"` // 保存時の入力では使わない
	Title       string   `json:"title"`
	StartTime   int64    `json:"start_time"` // UNIX秒
	Target      string   `json:"target"`
	Memo        string   `json:"memo"`
	IntervalSec int      `json:"interval_sec"`
	Waypoints   [][3]int `json:"waypoints"`
}

// ListRoutes は全ての正解経路を新しい順に返す
func ListRoutes() ([]Route, error) {
	rows, err := db.DB.Query(`
		SELECT route_id, title, extract(epoch FROM start_time)::bigint, target, memo, interval_sec, waypoints
		FROM ground_truth_route
		ORDER BY route_id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	routes := []Route{}
	for rows.Next() {
		var r Route
		var waypoints []byte
		if err := rows.Scan(&r.RouteID, &r.Title, &r.StartTime, &r.Target, &r.Memo, &r.IntervalSec, &waypoints); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(waypoints, &r.Waypoints); err != nil {
			return nil, err
		}
		routes = append(routes, r)
	}
	return routes, rows.Err()
}

// SaveRoute は正解経路を保存して route_id を返す。同じタイトルがあれば上書き（複数あれば最新の1件）し、
// なければ1行追加する。end_time は最後の通過点の時刻
func SaveRoute(r Route) (id int, overwritten bool, err error) {
	waypoints, err := json.Marshal(r.Waypoints)
	if err != nil {
		return 0, false, err
	}
	start := time.Unix(r.StartTime, 0)
	end := start.Add(time.Duration(r.Waypoints[len(r.Waypoints)-1][2]) * time.Second)
	// []byte のまま渡すと lib/pq が bytea として送るため、jsonb には文字列にして渡す
	args := []any{r.Title, start, end, r.Target, r.Memo, r.IntervalSec, string(waypoints)}

	err = db.DB.Get(&id, `
		UPDATE ground_truth_route
		SET start_time = $2, end_time = $3, target = $4, memo = $5, interval_sec = $6, waypoints = $7
		WHERE route_id = (SELECT max(route_id) FROM ground_truth_route WHERE title = $1)
		RETURNING route_id
	`, args...)
	if !errors.Is(err, sql.ErrNoRows) {
		return id, true, err
	}

	err = db.DB.Get(&id, `
		INSERT INTO ground_truth_route (title, start_time, end_time, target, memo, interval_sec, waypoints)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING route_id
	`, args...)
	return id, false, err
}

// DeleteRoute は指定した正解経路を削除する
func DeleteRoute(id int) error {
	_, err := db.DB.Exec(`DELETE FROM ground_truth_route WHERE route_id = $1`, id)
	return err
}
