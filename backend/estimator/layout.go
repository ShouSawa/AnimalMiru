// estimator/layout.go
package estimator

// SensorPos はセンサの位置[m]と向き[度]（東を0°とした反時計回り）
type SensorPos struct {
	X, Y, AngleDeg float64
}

// nodeIDs の並びが node_mask のビット（1,2,4,8）とセンサ番号の並びを決める
var nodeIDs = [4]string{"0002", "0003", "0004", "0005"}

// Sensors はノードを間隔 spacing[m] の正方形（中心は圃場の中心）に置いたときのセンサ12個の配置を返す．
// 添字は0〜11（センサ番号 k=1〜12 より1小さい）．
// A1は圃場の中心を向き，A2=A1+120°，A3=A1+240°．向きは Home.jsx の nodes と同じ値
func Sensors(spacing float64) (s [12]SensorPos) {
	// X, Y は中心から見た向き（±1）
	nodes := [4]SensorPos{{1, 1, 225}, {1, -1, 135}, {-1, -1, 45}, {-1, 1, 315}}
	for n, node := range nodes {
		for a := 0; a < 3; a++ {
			angle := node.AngleDeg + 120*float64(a)
			if angle >= 360 {
				angle -= 360
			}
			s[n*3+a] = SensorPos{node.X * spacing / 2, node.Y * spacing / 2, angle}
		}
	}
	return
}

// SensorNo は（ノード，センサ）に対応するセンサ番号（1〜12）を返す．無ければ−1
func SensorNo(nodeID, sensorID string) int {
	a := map[string]int{"A1": 0, "A2": 1, "A3": 2}
	idx, ok := a[sensorID]
	if !ok {
		return -1
	}
	for n, id := range nodeIDs {
		if id == nodeID {
			return n*3 + idx + 1
		}
	}
	return -1
}
