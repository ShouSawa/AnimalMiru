// repository/estimator_config_list.go
package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/db"
)

// EstimatorConfig は estimator_config の1行
type EstimatorConfig struct {
	ConfigID      int               `db:"config_id" json:"config_id"`
	Name          string            `db:"name" json:"name"`
	CreatedAt     time.Time         `db:"created_at" json:"created_at"`
	CodeVersion   *string           `db:"code_version" json:"code_version"`
	Note          *string           `db:"note" json:"note"`
	GridNx        int               `db:"grid_nx" json:"grid_nx"`
	GridNy        int               `db:"grid_ny" json:"grid_ny"`
	CellSizeM     float64           `db:"cell_size_m" json:"cell_size_m"`
	GridXMinM     float64           `db:"grid_x_min_m" json:"grid_x_min_m"`
	GridYMinM     float64           `db:"grid_y_min_m" json:"grid_y_min_m"`
	MapEncoding   int               `db:"map_encoding" json:"map_encoding"`
	WindowSec     int               `db:"window_sec" json:"window_sec"`
	DelaySec      float64           `db:"delay_sec" json:"delay_sec"`
	MinSamples    int               `db:"min_samples" json:"min_samples"`
	ActiveThreshV float64           `db:"active_thresh_v" json:"active_thresh_v"`
	FovHalfDeg    float64           `db:"fov_half_deg" json:"fov_half_deg"`
	RangeM        float64           `db:"range_m" json:"range_m"`
	D0M           float64           `db:"d0_m" json:"d0_m"`
	SigmaObs      float64           `db:"sigma_obs" json:"sigma_obs"`
	Epsilon       float64           `db:"epsilon" json:"epsilon"`
	Beta          float64           `db:"beta" json:"beta"`
	SigmaMoveM    float64           `db:"sigma_move_m" json:"sigma_move_m"`
	QuietResetSec *int              `db:"quiet_reset_sec" json:"quiet_reset_sec"`
	NodeSpacingM  float64           `db:"node_spacing_m" json:"node_spacing_m"`
	Sensors       []EstimatorSensor `db:"-" json:"sensors"`
	Main          bool              `db:"main" json:"main"`
}

// EstimatorSensor は estimator_sensor の1行（config_id は親の EstimatorConfig が持つ）
type EstimatorSensor struct {
	SensorNo   int     `db:"sensor_no" json:"sensor_no"`
	NoiseFloor float64 `db:"noise_floor" json:"noise_floor"`
	UpperLevel float64 `db:"upper_level" json:"upper_level"`
}

const selectConfig = `
	SELECT config_id, name, created_at, code_version, note, main,
	       grid_nx, grid_ny, cell_size_m, grid_x_min_m, grid_y_min_m, map_encoding,
	       window_sec, delay_sec, min_samples, active_thresh_v,
	       fov_half_deg, range_m, d0_m, sigma_obs, epsilon, beta,
	       sigma_move_m, quiet_reset_sec, node_spacing_m
	FROM estimator_config`

// attrColumns は config_id・created_at・name・main 以外の列．attrs() の並びと一致させること
var attrColumns = []struct{ name, typ string }{
	{"code_version", "text"}, {"note", "text"},
	{"grid_nx", "smallint"}, {"grid_ny", "smallint"}, {"cell_size_m", "real"},
	{"grid_x_min_m", "real"}, {"grid_y_min_m", "real"}, {"map_encoding", "smallint"},
	{"window_sec", "smallint"}, {"delay_sec", "real"}, {"min_samples", "smallint"},
	{"active_thresh_v", "real"}, {"fov_half_deg", "real"}, {"range_m", "real"},
	{"d0_m", "real"}, {"sigma_obs", "real"}, {"epsilon", "real"}, {"beta", "real"},
	{"sigma_move_m", "real"}, {"quiet_reset_sec", "smallint"}, {"node_spacing_m", "real"},
}

func (c EstimatorConfig) attrs() []any {
	return []any{c.CodeVersion, c.Note, c.GridNx, c.GridNy, c.CellSizeM, c.GridXMinM, c.GridYMinM,
		c.MapEncoding, c.WindowSec, c.DelaySec, c.MinSamples, c.ActiveThreshV, c.FovHalfDeg, c.RangeM,
		c.D0M, c.SigmaObs, c.Epsilon, c.Beta, c.SigmaMoveM, c.QuietResetSec, c.NodeSpacingM}
}

// GetConfig は config_id の設定を返す
func GetConfig(id int) (EstimatorConfig, error) {
	var c EstimatorConfig
	err := db.DB.Get(&c, selectConfig+` WHERE config_id = $1`, id)
	return c, err
}

// MainConfigID は main=true の config_id を返す（無ければ sql.ErrNoRows）
func MainConfigID() (int, error) {
	var id int
	err := db.DB.Get(&id, `SELECT config_id FROM estimator_config WHERE main`)
	return id, err
}

// SetMainConfig は main=true を id の設定へ付け替える．
// true は1行だけ（部分一意インデックス）なので，先に旧 main を false にしてから id を true にする
func SetMainConfig(id int) error {
	tx, err := db.DB.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE estimator_config SET main = false WHERE main AND config_id <> $1`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE estimator_config SET main = true WHERE config_id = $1 AND NOT main`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// ListConfigs は全設定を estimator_sensor の12行つきで config_id の昇順で返す
func ListConfigs() ([]EstimatorConfig, error) {
	configs := []EstimatorConfig{}
	if err := db.DB.Select(&configs, selectConfig+` ORDER BY config_id`); err != nil {
		return nil, err
	}
	var rows []struct {
		ConfigID int `db:"config_id"`
		EstimatorSensor
	}
	if err := db.DB.Select(&rows, `
		SELECT config_id, sensor_no, noise_floor, upper_level FROM estimator_sensor ORDER BY config_id, sensor_no
	`); err != nil {
		return nil, err
	}
	byID := map[int][]EstimatorSensor{}
	for _, r := range rows {
		byID[r.ConfigID] = append(byID[r.ConfigID], r.EstimatorSensor)
	}
	for i := range configs {
		configs[i].Sensors = byID[configs[i].ConfigID]
	}
	return configs, nil
}

// CreateConfig は c の内容で設定と estimator_sensor（12行）を追加する．
// name と created_at 以外の全属性と12センサの値が同じ設定が既にあれば追加せず，その config_id と created=false を返す．
// name が空か既存と重なるときは，時刻を付けた名前にする
func CreateConfig(c EstimatorConfig) (id int, created bool, err error) {
	tx, err := db.DB.Beginx()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	args := c.attrs()
	conds := make([]string, len(attrColumns))
	cols := make([]string, len(attrColumns))
	holders := make([]string, len(attrColumns))
	for i, col := range attrColumns {
		conds[i] = fmt.Sprintf("%s IS NOT DISTINCT FROM $%d::%s", col.name, i+1, col.typ)
		cols[i] = col.name
		holders[i] = fmt.Sprintf("$%d", i+2) // $1 は name
	}

	sensorsJSON, err := json.Marshal(c.Sensors)
	if err != nil {
		return 0, false, err
	}
	// 12センサの値が全て一致する設定だけを同じ設定とみなす
	conds = append(conds, fmt.Sprintf(`(
		SELECT count(*) FROM estimator_sensor s
		JOIN jsonb_to_recordset($%d::jsonb) AS t(sensor_no smallint, noise_floor real, upper_level real)
		  ON t.sensor_no = s.sensor_no AND t.noise_floor = s.noise_floor AND t.upper_level = s.upper_level
		WHERE s.config_id = estimator_config.config_id) = 12`, len(attrColumns)+1))

	err = tx.Get(&id, `SELECT config_id FROM estimator_config WHERE `+strings.Join(conds, " AND ")+` ORDER BY config_id LIMIT 1`, append(args, string(sensorsJSON))...)
	if err == nil {
		return id, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}

	name := strings.TrimSpace(c.Name)
	var exists bool
	if err := tx.Get(&exists, `SELECT EXISTS (SELECT 1 FROM estimator_config WHERE name = $1)`, name); err != nil {
		return 0, false, err
	}
	if name == "" || exists {
		if name == "" {
			name = "config"
		}
		name += "-" + time.Now().In(time.FixedZone("JST", 9*3600)).Format("20060102-150405")
	}

	err = tx.Get(&id, `INSERT INTO estimator_config (name, `+strings.Join(cols, ", ")+`)
		VALUES ($1, `+strings.Join(holders, ", ")+`) RETURNING config_id`, append([]any{name}, args...)...)
	if err != nil {
		return 0, false, err
	}
	res, err := tx.Exec(`
		INSERT INTO estimator_sensor (config_id, sensor_no, noise_floor, upper_level)
		SELECT $1, sensor_no, noise_floor, upper_level
		FROM jsonb_to_recordset($2::jsonb) AS t(sensor_no smallint, noise_floor real, upper_level real)
	`, id, string(sensorsJSON))
	if err != nil {
		return 0, false, err
	}
	if n, _ := res.RowsAffected(); n != 12 {
		return 0, false, fmt.Errorf("estimator_sensor は12行必要です（%d行）", n)
	}
	return id, true, tx.Commit()
}
