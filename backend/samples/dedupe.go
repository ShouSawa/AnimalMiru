// samples/dedupe.go
package samples

import "slices"

// DropDuplicates は同じ（ノード，センサ）で，直前に残した行と値がすべて同じ行が
// DuplicateGap 未満の間隔で来たとき，後の行を捨てる（Arduinoの再送などへの対処）．
// 入力は NodeTs 昇順を仮定する
func DropDuplicates(rows []Row) []Row {
	last := make(map[Key]Row)
	var kept []Row
	for _, r := range rows {
		key := Key{r.NodeID, r.SensorID}
		prev, ok := last[key]
		if ok && slices.Equal(prev.Values, r.Values) && r.NodeTs.Sub(prev.NodeTs) < DuplicateGap {
			continue
		}
		last[key] = r
		kept = append(kept, r)
	}
	return kept
}
