// runner/loop.go
package runner

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
)

const (
	catchUpMax = 10 * time.Second // これを超えて遅れたら取り戻さず最新の窓へ飛ぶ
	slowLimit  = time.Second
)

// Runner は毎秒1つの窓を処理する常駐処理
type Runner struct {
	deps     Deps
	configID int
	grid     estimator.Grid
	p        estimator.Params
	cal      [12]estimator.SensorCal
	filter   *estimator.Filter
	events   *EventCounter
	lastT    time.Time  // 最後に処理した窓の開始時刻（起動直後はゼロ値）
	mu       sync.Mutex // Tick と Switch が設定・信念を同時に触らないようにする
}

// New は一様な信念から始まる Runner を作る．lastEventID は MaxEventID の結果
func New(deps Deps, configID int, g estimator.Grid, p estimator.Params, cal [12]estimator.SensorCal, lastEventID int) *Runner {
	return &Runner{
		deps: deps, configID: configID, grid: g, p: p, cal: cal,
		filter: estimator.NewFilter(g, p), events: NewEventCounter(lastEventID),
	}
}

// Run は毎秒の切り替わり直後に Tick を呼ぶ．ctx が終わるまで続ける
func (r *Runner) Run(ctx context.Context) {
	for {
		now := r.deps.Now()
		select {
		case <-ctx.Done():
			return
		case <-time.After(now.Truncate(time.Second).Add(time.Second).Sub(now)):
			r.Tick()
		}
	}
}

// Tick は現在時刻に対応する窓を処理する．取りこぼした窓があれば順に処理する．
// 起動直後は過去に遡らず，10秒を超えて遅れたときは最新の窓へ飛んで信念を一様に戻す
func (r *Runner) Tick() {
	r.mu.Lock()
	defer r.mu.Unlock()
	target := TargetStart(r.deps.Now(), r.p.WindowSec, r.p.DelaySec)
	first := target
	switch gap := target.Sub(r.lastT); {
	case r.lastT.IsZero():
	case gap <= 0:
		return
	case gap > catchUpMax:
		log.Printf("推定: %s 遅れたので最新の窓へ飛びます（信念を一様に戻す）", gap)
		r.filter.Reset()
	case gap >= 2*time.Second:
		first = r.lastT.Add(time.Second)
	}
	for t := first; !t.After(target); t = t.Add(time.Second) {
		r.processTimed(t)
	}
	r.lastT = target
}

func (r *Runner) processTimed(T time.Time) {
	start := r.deps.Now()
	if err := r.Process(T); err != nil {
		log.Printf("推定失敗: T=%s: %v", T.Format(time.RFC3339), err)
	}
	if d := r.deps.Now().Sub(start); d > slowLimit {
		log.Printf("1秒以内に計算失敗: T=%s 処理時間=%s", T.Format(time.RFC3339), d)
	}
}
