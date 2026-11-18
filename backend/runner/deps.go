// runner/deps.go
package runner

import (
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

// Deps は外部への依存を関数で受け取る（テストで差し替える）
type Deps struct {
	GetRows    func(from, to time.Time) ([]samples.Row, error)
	SaveResult func(repository.EstimationRow) (inserted bool, err error)
	Broadcast  func(any)
	Now        func() time.Time
}
