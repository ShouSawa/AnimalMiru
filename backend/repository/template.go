// repository/template.go
package repository

import "github.com/ShouSawa/AnimalMiru/backend/db"

// DataTemplate は設定エリアのテンプレート1件分。StartTime は "YYYY-MM-DDTHH:MM:SS" 形式
type DataTemplate struct {
	Name           string `db:"name" json:"name"`
	TimeRange      int    `db:"time_range" json:"time_range"`
	HorizontalAxis string `db:"horizontal_axis" json:"horizontal_axis"`
	VerticalAxis   string `db:"vertical_axis" json:"vertical_axis"`
	StartTime      string `db:"start_time" json:"start_time"`
}

// GetTemplateNames はテンプレート名の一覧を名前順に返す
func GetTemplateNames() ([]string, error) {
	names := []string{}
	err := db.DB.Select(&names, `SELECT name FROM data_template ORDER BY name`)
	return names, err
}

// GetTemplate は指定した名前のテンプレートを返す。存在しない場合は sql.ErrNoRows を返す
func GetTemplate(name string) (DataTemplate, error) {
	var t DataTemplate
	// start_time はタイムゾーンの変換が起きないよう、文字列にしてから受け取る
	err := db.DB.Get(&t, `
		SELECT name, time_range, horizontal_axis, vertical_axis,
			to_char(start_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_time
		FROM data_template
		WHERE name = $1
	`, name)
	return t, err
}

// SaveTemplate はテンプレートを保存する。同じ名前がすでにあれば上書きする
func SaveTemplate(t DataTemplate) error {
	_, err := db.DB.Exec(`
		INSERT INTO data_template (name, time_range, horizontal_axis, vertical_axis, start_time)
		VALUES ($1, $2, $3, $4, $5::timestamp)
		ON CONFLICT (name) DO UPDATE SET
			time_range = EXCLUDED.time_range,
			horizontal_axis = EXCLUDED.horizontal_axis,
			vertical_axis = EXCLUDED.vertical_axis,
			start_time = EXCLUDED.start_time
	`, t.Name, t.TimeRange, t.HorizontalAxis, t.VerticalAxis, t.StartTime)
	return err
}
