// samples/row.go
package samples

import "time"

// Row は sensor_reading の1行
type Row struct {
	NodeID, SensorID string
	NodeTs           time.Time
	Values           []int
}

// Key はノードとセンサの組
type Key struct {
	NodeID, SensorID string
}

// Sample は時刻を割り当てた1つの測定値
type Sample struct {
	T time.Time
	V int
}
