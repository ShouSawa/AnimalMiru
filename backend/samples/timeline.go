// samples/timeline.go
package samples

import "time"

// SampleTime は n 個の値を持つ行の j 番目（0が最も古い）の測定時刻を返す．
// 最後の値はパケットを読む直前に測られたので，node_timestamp から DeltaFix だけ前になる．
// グラフと推定の両方がこの関数で時刻を決める
func SampleTime(nodeTs time.Time, n, j int) time.Time {
	return nodeTs.Add(-time.Duration(n-1-j)*SampleInterval - DeltaFix)
}

// FirstSampleTime は行の先頭（最も古い値）の測定時刻を返す
func FirstSampleTime(nodeTs time.Time, n int) time.Time {
	return SampleTime(nodeTs, n, 0)
}

// QueryRange は補正後の時刻が [from, to) に入る値を含む行の node_timestamp の検索範囲を返す．
// 1行は最大 (MaxRowSamples-1)×35ms さかのぼる
func QueryRange(from, to time.Time) (time.Time, time.Time) {
	return from.Add(DeltaFix), to.Add(DeltaFix + (MaxRowSamples-1)*SampleInterval)
}
