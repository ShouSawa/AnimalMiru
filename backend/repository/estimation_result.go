// repository/estimation_result.go
package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/db"
	"github.com/lib/pq"
)

// EstimationRow は estimation_result の1行
type EstimationRow struct {
	ConfigID                 int
	Ts                       time.Time
	UpdateType, NodeMask     int
	Active                   bool
	EstX, EstY, MeanX, MeanY float64
	PMax, Radius90, Entropy  float64
	NSensors                 int
	ActiveSum                float64
	S                        [12]*int16 // 100×s_k．欠測は nil
	MapZ                     []byte
	ComputedAt               time.Time
	EventID                  int
}

// SaveResult は結果を保存する．同じ（config_id，ts）が既にあれば何もせず inserted=false を返す
func SaveResult(r EstimationRow) (inserted bool, err error) {
	args := []any{
		r.ConfigID, r.Ts, r.UpdateType, r.NodeMask, r.Active,
		r.EstX, r.EstY, r.MeanX, r.MeanY, r.PMax, r.Radius90, r.Entropy,
		r.NSensors, r.ActiveSum, r.MapZ, r.ComputedAt, r.EventID,
	}
	for _, s := range r.S {
		args = append(args, s) // nil のポインタは NULL として保存される
	}
	holders := make([]string, len(args))
	for i := range holders {
		holders[i] = fmt.Sprintf("$%d", i+1)
	}

	res, err := db.DB.Exec(`
		INSERT INTO estimation_result (
			config_id, ts, update_type, node_mask, active,
			est_x, est_y, mean_x, mean_y, p_max, radius90, entropy,
			n_sensors, active_sum, map_z, computed_at, event_id,
			s_01, s_02, s_03, s_04, s_05, s_06, s_07, s_08, s_09, s_10, s_11, s_12)
		VALUES (`+strings.Join(holders, ",")+`)
		ON CONFLICT (config_id, ts) DO NOTHING
	`, args...)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// GetFrames は ts が [from, to) の結果を ts の昇順で返す．withMap=false なら map_z は読まない
func GetFrames(configID int, from, to time.Time, withMap bool) ([]EstimationRow, error) {
	mapCol := "NULL::bytea"
	if withMap {
		mapCol = "map_z"
	}
	rows, err := db.DB.Query(`
		SELECT config_id, ts, update_type, node_mask, active,
		       COALESCE(est_x,0), COALESCE(est_y,0), COALESCE(mean_x,0), COALESCE(mean_y,0),
		       COALESCE(p_max,0), COALESCE(radius90,0), COALESCE(entropy,0),
		       n_sensors, COALESCE(active_sum,0),
		       ARRAY[s_01,s_02,s_03,s_04,s_05,s_06,s_07,s_08,s_09,s_10,s_11,s_12],
		       `+mapCol+`, computed_at, COALESCE(event_id,0)
		FROM estimation_result
		WHERE config_id = $1 AND ts >= $2 AND ts < $3
		ORDER BY ts
	`, configID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []EstimationRow
	for rows.Next() {
		var r EstimationRow
		var s []sql.NullInt64
		err := rows.Scan(&r.ConfigID, &r.Ts, &r.UpdateType, &r.NodeMask, &r.Active,
			&r.EstX, &r.EstY, &r.MeanX, &r.MeanY, &r.PMax, &r.Radius90, &r.Entropy,
			&r.NSensors, &r.ActiveSum, pq.Array(&s), &r.MapZ, &r.ComputedAt, &r.EventID)
		if err != nil {
			return nil, err
		}
		for k, v := range s {
			if v.Valid {
				x := int16(v.Int64)
				r.S[k] = &x
			}
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// MaxEventID は config の最大の event_id を返す（結果が無ければ0）
func MaxEventID(configID int) (int, error) {
	var id int
	err := db.DB.Get(&id, `SELECT COALESCE(MAX(event_id),0) FROM estimation_result WHERE config_id = $1`, configID)
	return id, err
}
