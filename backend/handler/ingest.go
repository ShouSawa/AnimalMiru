// handler/ingest.go
package handler

import (
	"log"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
)

// BeagleBoneから受け取るJSONの構造
type SensorEntry struct {
	NodeID     string  `json:"node_id"`
	RssiHex    string  `json:"rssi_hex"`
	PayloadHex string  `json:"payload_hex"`
	Timestamp  float64 `json:"timestamp"`
}

type IngestRequest struct {
	GatewayID  string        `json:"gateway_id"`
	SensorData []SensorEntry `json:"sensor_data"`
	ReceivedAt string        `json:"received_at"`
}

// SaveIngestRequest はTCPから受け取ったデータを保存する共通処理
func SaveIngestRequest(req *IngestRequest) (saved int, total int) {
	total = len(req.SensorData)

	receivedAt, err := time.Parse(time.RFC3339Nano, req.ReceivedAt)
	if err != nil {
		receivedAt = time.Now()
	}

	for _, entry := range req.SensorData {
		nodeTimestamp := time.Unix(int64(entry.Timestamp), 0).UTC()

		err = repository.SaveSensorData(
			req.GatewayID,
			receivedAt,
			entry.NodeID,
			nodeTimestamp,
			entry.RssiHex,
			entry.PayloadHex,
		)
		if err != nil {
			log.Printf("DB保存失敗 node=%s: %v", entry.NodeID, err)
			continue
		}
		saved++
	}
	return
}
