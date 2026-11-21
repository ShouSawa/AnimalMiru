// runner/replay_test.go
package runner

import (
	"context"
	"testing"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

func testCal() (cal [12]estimator.SensorCal) {
	for k := range cal {
		cal[k] = estimator.SensorCal{Noise: 20, Upper: 120}
	}
	return cal
}

func TestNotifyIsCoalesced(t *testing.T) {
	r := newRunner(newFake(), nil)
	r.Notify()
	r.Notify()
	r.Notify() // 待たずに戻り，合図は1つにまとまる
	if len(r.trigger) != 1 {
		t.Errorf("合図の数=%d, want 1", len(r.trigger))
	}
}

func TestRunStopsOnCancel(t *testing.T) {
	r := newRunner(newFake(), nil)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		r.Run(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("ctx を止めても Run が終わらない")
	}
}

// 時刻のきっかけ（ティッカー）が無くても，Notify だけで計算・保存される
func TestRunTicksOnNotify(t *testing.T) {
	f := newFake()
	f.addRow(at(10, 57, 17, 0), 100)
	d := f.deps()
	saved := make(chan repository.EstimationRow, 1)
	d.SaveResult = func(r repository.EstimationRow) (bool, error) {
		saved <- r
		return true, nil
	}
	r := New(d, 1, estimator.DefaultGrid(), estimator.DefaultParams(), testCal(), 0)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go r.Run(ctx)

	select {
	case <-saved:
		t.Fatal("Notify する前に計算してはいけない")
	case <-time.After(50 * time.Millisecond):
	}
	r.Notify()
	select {
	case row := <-saved:
		if !row.Ts.Equal(at(10, 57, 17, 0)) {
			t.Errorf("ts=%s", row.Ts)
		}
	case <-time.After(time.Second):
		t.Fatal("Notify しても計算されない")
	}
}

func TestReplaySavesOnlyTarget(t *testing.T) {
	f := newFake()
	T := at(10, 57, 17, 0)
	f.addRow(T.Add(-5*time.Second), 100) // 追いつく間の反応の秒．保存しない
	f.addRow(T, 100)
	if err := Replay(f.deps(), 1, estimator.DefaultGrid(), estimator.DefaultParams(), testCal(), 0, T); err != nil {
		t.Fatal(err)
	}
	if len(f.saved) != 1 || !f.saved[0].Ts.Equal(T) || f.broadcast != 0 {
		t.Fatalf("T の1行だけ保存し，配信しないはず: saved=%d broadcast=%d", len(f.saved), f.broadcast)
	}
}

func TestReplayNoReactionSavesNothing(t *testing.T) {
	f := newFake()
	T := at(10, 57, 17, 0)
	f.addRow(T.Add(-5*time.Second), 100) // T 自体は反応なし
	if err := Replay(f.deps(), 1, estimator.DefaultGrid(), estimator.DefaultParams(), testCal(), 0, T); err != nil {
		t.Fatal(err)
	}
	if len(f.saved) != 0 {
		t.Errorf("反応のない秒は保存しない: saved=%d", len(f.saved))
	}
}

func TestReplayReadsRowsOnce(t *testing.T) {
	f := newFake()
	T := at(10, 57, 17, 0)
	f.addRow(T, 100)
	d := f.deps()
	calls := 0
	orig := d.GetRows
	d.GetRows = func(from, to time.Time) ([]samples.Row, error) {
		calls++
		return orig(from, to)
	}
	if err := Replay(d, 1, estimator.DefaultGrid(), estimator.DefaultParams(), testCal(), 0, T); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Errorf("DBは1回だけ読むはず: calls=%d", calls)
	}
}

// 追いつく間に反応がなければ，一様な信念から1回更新した値と同じになる（既定の設定は30秒の無反応で一様に戻る）
func TestReplayStartsFromUniform(t *testing.T) {
	want := firstPMax()
	f := newFake()
	T := at(10, 57, 17, 0)
	f.addRow(T, 100)
	if err := Replay(f.deps(), 1, estimator.DefaultGrid(), estimator.DefaultParams(), testCal(), 0, T); err != nil {
		t.Fatal(err)
	}
	got := f.saved[0].PMax
	if got < want*0.9999 || got > want*1.0001 {
		t.Errorf("p_max=%v, want %v", got, want)
	}
}

func TestReplayEventIDContinues(t *testing.T) {
	f := newFake()
	T := at(10, 57, 17, 0)
	f.addRow(T, 100)
	if err := Replay(f.deps(), 1, estimator.DefaultGrid(), estimator.DefaultParams(), testCal(), 7, T); err != nil {
		t.Fatal(err)
	}
	if f.saved[0].EventID != 8 {
		t.Errorf("event_id=%d, want 8", f.saved[0].EventID)
	}
}
