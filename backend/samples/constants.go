// samples/constants.go
package samples

import "time"

const (
	// SampleInterval は1行に並んだ値どうしの測定間隔（Arduinoの記録間隔）
	SampleInterval = 35 * time.Millisecond

	// DeltaFix は node_timestamp と最後の値の測定時刻のずれの補正量
	// 要確認: 未測定のため0．Arduino→IM920s→BeagleBoneの遅れとLTE片道遅延の和になる
	DeltaFix time.Duration = 0

	// MaxRowSamples は1パケットの1センサあたりの値の個数
	MaxRowSamples = 10

	// DuplicateGap は同じ値の行を再送による重複とみなす node_timestamp の差の上限
	// 要確認: 実データの重複間隔を見て決める
	DuplicateGap = 300 * time.Millisecond
)
