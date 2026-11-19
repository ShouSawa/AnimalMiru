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

// Runner はセンサデータの到着をきっかけに，計算できる窓を1秒ずつ処理する常駐処理
type Runner struct {
	deps     Deps
	configID int
	grid     estimator.Grid
	p        estimator.Params
	cal      [12]estimator.SensorCal
	filter   *estimator.Filter
	events   *EventCounter
	lastT    time.Time     // 最後に処理した窓の開始時刻（起動直後はゼロ値）
	mu       sync.Mutex    // Tick と Switch が設定・信念を同時に触らないようにする
	trigger  chan struct{} // Notify の合図．容量1で，処理待ちの間の合図はまとめる
}

// New は一様な信念から始まる Runner を作る．lastEventID は MaxEventID の結果
func New(deps Deps, configID int, g estimator.Grid, p estimator.Params, cal [12]estimator.SensorCal, lastEventID int) *Runner {
	return &Runner{
		deps: deps, configID: configID, grid: g, p: p, cal: cal,
		filter: estimator.NewFilter(g, p), events: NewEventCounter(lastEventID),
		trigger: make(chan struct{}, 1),
	}
}

// Notify はセンサデータをDBへ保存した直後に呼ぶ．待たずにすぐ戻る．
// 計算中に何度呼ばれても，終わったあとにもう1回 Tick が走る
func (r *Runner) Notify() {
	select {
	case r.trigger <- struct{}{}:
	default:
	}
}

// Run は Notify の合図ごとに Tick を呼ぶ．ctx が終わるまで続ける
func (r *Runner) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.trigger:
			r.Tick()
		}
	}
}

// Tick は現在時刻（now − 窓の長さ − delay_sec）までに完成した窓を処理する．取りこぼした窓があれば順に処理する．
// 起動直後は過去に遡らず，10秒を超えて空いたときは最新の窓へ飛んで信念を一様に戻す
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
		log.Printf("推定: %s 空いたので最新の窓へ飛びます（信念を一様に戻す）", gap)
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
