// handler/ingest.go
package handler

import (
	"log"
	"net/http"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/gin-gonic/gin"
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

func Ingest(c *gin.Context) {
	var req IngestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// received_at を time.Time に変換
	receivedAt, err := time.Parse(time.RFC3339, req.ReceivedAt)
	if err != nil {
		receivedAt = time.Now() // パース失敗時は現在時刻を使う
	}

	// sensor_data の各エントリをDBに保存する
	savedCount := 0
	for _, entry := range req.SensorData {
		// node_id は "0002" の形式で届くため、変換せずそのまま使う

		// timestamp（UNIXタイムスタンプ）を time.Time に変換
		nodeTimestamp := time.Unix(int64(entry.Timestamp), 0).UTC()

		// DBに保存
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
		savedCount++
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"saved":  savedCount, // 保存できた件数を返す
		"total":  len(req.SensorData),
	})
}
