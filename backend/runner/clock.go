// runner/clock.go
package runner

import "time"

// TargetStart は時刻 now に計算する窓の開始時刻（整数秒に切り下げ）を返す．
// 例: window=1，delay=3.0 なら 10:57:21 に 10:57:17 から始まる1秒を計算する
func TargetStart(now time.Time, windowSec int, delaySec float64) time.Time {
	wait := time.Duration(windowSec)*time.Second + time.Duration(delaySec*float64(time.Second))
	return now.Add(-wait).Truncate(time.Second)
}
