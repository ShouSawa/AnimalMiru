// handler/ingest.go
package handler

import (
	"net/http"
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

	// JSONを受け取る
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// とりあえずログに出力（DB保存は次のステップで追加）
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"gateway": req.GatewayID,
		"count":   len(req.SensorData),
	})
}