// repository/route.go
package repository

import (
	"encoding/json"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/db"
)

// Route は正解経路1件分の入力。Waypoints は [ix, iy, 開始からの秒] を通過順に並べたもの
type Route struct {
	Title       string   `json:"title"`
	StartTime   int64    `json:"start_time"` // UNIX秒
	Target      string   `json:"target"`
	Memo        string   `json:"memo"`
	IntervalSec int      `json:"interval_sec"`
	Waypoints   [][3]int `json:"waypoints"`
}

// CreateRoute は正解経路を1行追加して route_id を返す。end_time は最後の通過点の時刻
func CreateRoute(r Route) (id int, err error) {
	waypoints, err := json.Marshal(r.Waypoints)
	if err != nil {
		return 0, err
	}
	start := time.Unix(r.StartTime, 0)
	end := start.Add(time.Duration(r.Waypoints[len(r.Waypoints)-1][2]) * time.Second)

	// []byte のまま渡すと lib/pq が bytea として送るため、jsonb には文字列にして渡す
	err = db.DB.Get(&id, `
		INSERT INTO ground_truth_route (title, start_time, end_time, target, memo, interval_sec, waypoints)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING route_id
	`, r.Title, start, end, r.Target, r.Memo, r.IntervalSec, string(waypoints))
	return id, err
}
