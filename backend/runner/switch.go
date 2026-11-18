// runner/switch.go
package runner

import "github.com/ShouSawa/AnimalMiru/backend/estimator"

// Switch は以降の推定を別の設定で行うように切り替える．信念は一様に戻し，event_id は lastEventID から続ける
func (r *Runner) Switch(configID int, g estimator.Grid, p estimator.Params, cal [12]estimator.SensorCal, lastEventID int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.configID, r.grid, r.p, r.cal = configID, g, p, cal
	r.filter = estimator.NewFilter(g, p)
	r.events = NewEventCounter(lastEventID)
}

// ConfigID は使用中の config_id を返す
func (r *Runner) ConfigID() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.configID
}
