// runner/stats.go
package runner

import (
	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

// ToStats は（ノード，センサ）ごとのサンプル列をセンサ番号順（12個）の統計にする．
// サンプルが無いセンサと，センサ番号が決まらないキーは対象外（nil のまま）
func ToStats(m map[samples.Key][]samples.Sample) [12]*estimator.Stat {
	var stats [12]*estimator.Stat
	for key, ss := range m {
		no := estimator.SensorNo(key.NodeID, key.SensorID)
		if no < 1 || len(ss) == 0 {
			continue
		}
		st := &estimator.Stat{Count: len(ss), Min: ss[0].V, Max: ss[0].V}
		for _, s := range ss {
			st.Min = min(st.Min, s.V)
			st.Max = max(st.Max, s.V)
		}
		stats[no-1] = st
	}
	return stats
}
