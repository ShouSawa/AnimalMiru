// handler/ingest.go
package handler

import (
	"log"
	"strings"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

// BeagleBoneから受け取るJSONの構造
type SensorEntry struct {
	NodeID     string  `json:"node_id"`
	RssiHex    string  `json:"rssi_hex"`
	PayloadHex string  `json:"payload_hex"`
	Timestamp  float64 `json:"timestamp"`
	T0         float64 `json:"t0"` // 先頭サンプルの補正後時刻（UNIX秒）．リアルタイムのグラフが使う
}

type IngestRequest struct {
	GatewayID  string        `json:"gateway_id"`
	SensorData []SensorEntry `json:"sensor_data"`
	Timestamp  float64       `json:"timestamp"` // BeagleBoneがこのバッチを送信した時刻
	ReceivedAt string        `json:"received_at"`
}

// SaveIngestRequest はTCPから受け取ったデータを保存する共通処理
func SaveIngestRequest(req *IngestRequest) (saved int, total int) {
	total = len(req.SensorData)

	receivedAt, err := time.Parse(time.RFC3339Nano, req.ReceivedAt)
	if err != nil {
		receivedAt = time.Now()
	}

	for i := range req.SensorData {
		entry := &req.SensorData[i]

		// node_timestampはサーバーの受信時刻(receivedAt)を基準に、
		// BeagleBone上での「バッチ送信時刻 − パケット受信時刻」だけさかのぼった時刻にする。
		// BeagleBoneはRTCが無く時計そのものはずれることがあるが、パケット間の時間差は正しいため、
		// 同じバッチ内のパケットも別々の時刻として扱える。
		nodeTimestamp := receivedAt
		if req.Timestamp > 0 {
			nodeTimestamp = receivedAt.Add(-time.Duration((req.Timestamp - entry.Timestamp) * float64(time.Second)))
		}
		// ここでentry.Timestampも上書きしておくことで、この後WebSocketで
		// 配信される値もDB保存値と一致させる（REST取得分と食い違わないように）。
		// DBから読み出す時刻（GetSeriesのUnixMicro）と揃えるため、マイクロ秒まで残す
		entry.Timestamp = float64(nodeTimestamp.UnixMicro()) / 1e6
		// 1センサあたりの値の個数 = payload_hexの要素数÷3（A1,A2,A3の3値ずつ）
		n := len(strings.Split(strings.TrimSpace(entry.PayloadHex), ",")) / 3
		entry.T0 = float64(samples.FirstSampleTime(nodeTimestamp, n).UnixMicro()) / 1e6

		err = repository.SaveSensorData(
			req.GatewayID,
			receivedAt,
			nodeTimestamp,
			entry.NodeID,
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
