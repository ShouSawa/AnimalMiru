// repository/sensor_rows.go
package repository

import (
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/db"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

// GetRows は node_timestamp が [from, to) の sensor_reading を古い順に返す
func GetRows(from, to time.Time) ([]samples.Row, error) {
	var dbRows []struct {
		NodeID        string    `db:"node_id"`
		NodeTimestamp time.Time `db:"node_timestamp"`
		SensorID      string    `db:"sensor_id"`
		ValueDec      string    `db:"value_dec"`
	}
	err := db.DB.Select(&dbRows, `
		SELECT node_id, node_timestamp, sensor_id, value_dec
		FROM sensor_reading
		WHERE node_timestamp >= $1 AND node_timestamp < $2
		ORDER BY node_timestamp
	`, from, to)
	if err != nil {
		return nil, err
	}

	rows := make([]samples.Row, 0, len(dbRows))
	for _, r := range dbRows {
		rows = append(rows, samples.Row{
			NodeID:   r.NodeID,
			SensorID: r.SensorID,
			NodeTs:   r.NodeTimestamp,
			Values:   samples.ParseValues(r.ValueDec),
		})
	}
	return rows, nil
}
