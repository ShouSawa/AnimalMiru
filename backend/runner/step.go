// runner/step.go
package runner

import (
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/frame"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

// Process は窓 [T, T+window) を1つ処理する．保存対象なら保存して配信する
func (r *Runner) Process(T time.Time) error {
	end := T.Add(time.Duration(r.p.WindowSec) * time.Second)
	rows, err := r.deps.GetRows(samples.QueryRange(T, end))
	if err != nil {
		return err
	}
	samps := samples.Collect(samples.DropDuplicates(rows), T, end)
	ft := estimator.BuildFeatures(ToStats(samps), r.cal, r.p)

	bel, save := r.filter.Step(ft)
	if !save {
		return nil
	}
	res, err := estimator.NewResult(bel, r.grid, ft)
	if err != nil {
		return err
	}
	row := buildRow(r.configID, T, r.deps.Now(), r.events.Next(T), res)
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
