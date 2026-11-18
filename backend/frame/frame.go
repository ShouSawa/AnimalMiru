// frame/frame.go
package frame

// Frame は1秒窓の推定結果のJSON形式．時刻はUNIX秒（小数）．
// APIとWebSocketの両方で使う
type Frame struct {
	Ts         float64    `json:"ts"`
	WindowSec  int        `json:"window_sec"`
	Active     bool       `json:"active"`
	UpdateType int        `json:"update_type"`
	NodeMask   int        `json:"node_mask"`
	EstX       float64    `json:"est_x"`
	EstY       float64    `json:"est_y"`
	MeanX      float64    `json:"mean_x"`
	MeanY      float64    `json:"mean_y"`
	PMax       float64    `json:"p_max"`
	Radius90   float64    `json:"radius90"`
	Entropy    float64    `json:"entropy"`
	NSensors   int        `json:"n_sensors"`
	ActiveSum  float64    `json:"active_sum"`
	S          [12]*int16 `json:"s"` // 100×s_k．欠測は null
	EventID    int        `json:"event_id"`
	ComputedAt float64    `json:"computed_at"`
	MapQ       []int      `json:"map_q,omitempty"` // 0〜255．[]uint8 だとJSONがbase64になるので []int にする
}
