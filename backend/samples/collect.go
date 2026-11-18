// samples/collect.go
package samples

import "time"

// Collect は行を（ノード，センサ）ごとのサンプル列にまとめる．
// 補正後の時刻が [from, to) に入る値だけを残す．各列は入力の行順に並ぶ
func Collect(rows []Row, from, to time.Time) map[Key][]Sample {
	result := make(map[Key][]Sample)
	for _, r := range rows {
		key := Key{r.NodeID, r.SensorID}
		for j, v := range r.Values {
			t := SampleTime(r.NodeTs, len(r.Values), j)
			if t.Before(from) || !t.Before(to) {
				continue
			}
			result[key] = append(result[key], Sample{T: t, V: v})
		}
	}
	return result
}
