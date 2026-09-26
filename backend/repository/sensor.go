// repository/sensor.go
package repository

import (
	"strconv"
	"strings"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/db"
)

// SaveSensorData は受け取ったセンサデータを3つのテーブルに保存する関数
// node_timestampにはノード側の時刻ではなく、サーバーの受信時刻(receivedAt)を使う。
func SaveSensorData(gatewayID string, receivedAt time.Time, nodeID string,
	rssiHex string, payloadHex string) error {

	// ── 1. node_data に保存 ──────────────────────────────
	// node_data は (node_id, node_timestamp) の複合PKのため、
	// すでに同じデータがあれば無視する（DO NOTHING）
	// PostgreSQL標準の書き方を使用
	_, err := db.DB.Exec(`
		INSERT INTO node_data (node_id, node_timestamp)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, nodeID, receivedAt)
	if err != nil {
		return err
	}

	// ── 2. gateway_data に保存 ───────────────────────────
	_, err = db.DB.Exec(`
		INSERT INTO gateway_data (gw_timestamp, node_id, node_timestamp, rssi_hex)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT DO NOTHING
	`, receivedAt, nodeID, receivedAt, rssiHex)
	if err != nil {
		return err
	}

	// ── 3. sensor_reading に保存 ─────────────────────────
	// payload_hex を "72,71,73,72,71,6D,..." のようなカンマ区切りに分解する
	hexValues := strings.Split(strings.TrimSpace(payloadHex), ",")

	// 3バイトで1セット（A1・A2・A3）、最大10セット分をセンサーごとにまとめる
	sensorIDs := []string{"A1", "A2", "A3"}
	hexBySensor := make(map[string][]string, len(sensorIDs))
	decBySensor := make(map[string][]string, len(sensorIDs))

	for i := 0; i+2 < len(hexValues); i += 3 {
		for j, sensorID := range sensorIDs {
			hexStr := strings.TrimSpace(hexValues[i+j])

			// 16進数→10進数に変換
			decVal, err := strconv.ParseInt(hexStr, 16, 64)
			if err != nil {
				continue  // 変換失敗した値はスキップ
			}

			hexBySensor[sensorID] = append(hexBySensor[sensorID], hexStr)
			decBySensor[sensorID] = append(decBySensor[sensorID], strconv.FormatInt(decVal, 10))
		}
	}

	// センサーごとに1行（複数ラウンド分をカンマ区切りでまとめて）保存する
	// 同じバッチ内に同一ノードのデータが複数あると node_timestamp が重複するため、
	// その場合は既存行の末尾に今回の値を連結して、データが捨てられないようにする
	for _, sensorID := range sensorIDs {
		if len(hexBySensor[sensorID]) == 0 {
			continue  // このセンサーの値が1つも取れなかった場合は保存しない
		}

		valueHex := strings.Join(hexBySensor[sensorID], ",")
		valueDec := strings.Join(decBySensor[sensorID], ",")

		_, err = db.DB.Exec(`
			INSERT INTO sensor_reading
				(node_id, node_timestamp, sensor_id, value_hex, value_dec)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (node_id, node_timestamp, sensor_id) DO UPDATE SET
				value_hex = sensor_reading.value_hex || ',' || EXCLUDED.value_hex,
				value_dec = sensor_reading.value_dec || ',' || EXCLUDED.value_dec
		`, nodeID, receivedAt, sensorID, valueHex, valueDec)
		if err != nil {
			return err
		}
	}

	return nil  // 全て成功
}

// GetDataDates はデータが存在する日付（日本時間、"YYYY-MM-DD"）を古い順に返す
func GetDataDates() ([]string, error) {
	dates := []string{}
	err := db.DB.Select(&dates, `
		SELECT DISTINCT to_char(node_timestamp AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS d
		FROM node_data
		ORDER BY d
	`)
	return dates, err
}

// GetDataSecondsOfDay は指定日（dayStartから24時間）にデータが存在する時刻を、
// 日本時間の0時からの秒数（0〜86399）で古い順に返す
func GetDataSecondsOfDay(dayStart time.Time) ([]int, error) {
	seconds := []int{}
	// 日本時間の時刻部分(time型)を秒数に変換し、小数点以下(ミリ秒)は切り捨てる
	err := db.DB.Select(&seconds, `
		SELECT DISTINCT floor(extract(epoch FROM (node_timestamp AT TIME ZONE 'Asia/Tokyo')::time))::int AS s
		FROM node_data
		WHERE node_timestamp >= $1 AND node_timestamp < $2
		ORDER BY s
	`, dayStart, dayStart.AddDate(0, 0, 1))
	return seconds, err
}

// SensorLogRow はDB画面の一覧表示用に組み立てた1ノード分のデータ
type SensorLogRow struct {
	NodeID     string `json:"node_id"`
	RssiHex    string `json:"rssi_hex"`
	Timestamp  int64  `json:"timestamp"`
	PayloadHex string `json:"payload_hex"`
}

// GetRecentLogs はgateway_data・sensor_readingから直近limit件を取得し、
// フロントの一覧表示用に組み立てて返す（新しい順）
func GetRecentLogs(limit int) ([]SensorLogRow, error) {
	var gwRows []struct {
		NodeID        string    `db:"node_id"`
		NodeTimestamp time.Time `db:"node_timestamp"`
		RssiHex       string    `db:"rssi_hex"`
	}

	err := db.DB.Select(&gwRows, `
		SELECT node_id, node_timestamp, rssi_hex
		FROM gateway_data
		ORDER BY gw_timestamp DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}

	logs := make([]SensorLogRow, 0, len(gwRows))
	for _, g := range gwRows {
		var sensorRows []struct {
			SensorID string `db:"sensor_id"`
			ValueHex string `db:"value_hex"`
		}
		err := db.DB.Select(&sensorRows, `
			SELECT sensor_id, value_hex
			FROM sensor_reading
			WHERE node_id = $1 AND node_timestamp = $2
			ORDER BY sensor_id
		`, g.NodeID, g.NodeTimestamp)
		if err != nil {
			return nil, err
		}

		parts := make([]string, 0, len(sensorRows))
		for _, s := range sensorRows {
			parts = append(parts, s.SensorID+"="+s.ValueHex)
		}

		logs = append(logs, SensorLogRow{
			NodeID:     g.NodeID,
			RssiHex:    g.RssiHex,
			Timestamp:  g.NodeTimestamp.Unix(),
			PayloadHex: strings.Join(parts, " / "),
		})
	}

	return logs, nil
}