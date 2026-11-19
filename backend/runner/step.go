// runner/step.go
package runner

import (
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/frame"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

// compute は窓 [T, T+window) を1つ進め，保存対象ならDBの1行にして返す（保存・配信はしない）．
// 保存対象でない秒は ok=false
func (r *Runner) compute(T time.Time) (row repository.EstimationRow, ok bool, err error) {
	end := T.Add(time.Duration(r.p.WindowSec) * time.Second)
	rows, err := r.deps.GetRows(samples.QueryRange(T, end))
	if err != nil {
		return row, false, err
	}
	samps := samples.Collect(samples.DropDuplicates(rows), T, end)
	ft := estimator.BuildFeatures(ToStats(samps), r.cal, r.p)

	bel, save := r.filter.Step(ft)
	if !save {
		return row, false, nil
	}
	res, err := estimator.NewResult(bel, r.grid, ft)
	if err != nil {
		return row, false, err
	}
	return buildRow(r.configID, T, r.deps.Now(), r.events.Next(T), res), true, nil
}

// Process は窓 [T, T+window) を1つ処理する．保存対象なら保存して配信する
func (r *Runner) Process(T time.Time) error {
	row, ok, err := r.compute(T)
	if err != nil || !ok {
		return err
	}
	inserted, err := r.deps.SaveResult(row)
	if err != nil || !inserted {
		return err
	}

	f, err := frame.FromRow(row, r.p.WindowSec, true, r.grid.N())
	if err != nil {
		return err
	}
	r.deps.Broadcast(map[string]any{"estimation": f})
	return nil
}
