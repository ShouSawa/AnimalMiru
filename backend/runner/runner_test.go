// runner/runner_test.go
package runner

import (
	"bytes"
	"log"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/samples"
)

var jst = time.FixedZone("JST", 9*3600)

func at(h, m, s, ms int) time.Time {
	return time.Date(2026, 11, 18, h, m, s, ms*1e6, jst)
}

// fake は偽の Deps と，その呼ばれ方の記録
type fake struct {
	now       time.Time
	nowStep   time.Duration // Now を呼ぶたびに進める時間（処理時間の再現用）
	rows      []samples.Row
	saved     []repository.EstimationRow
	inserted  bool
	broadcast int
}

func (f *fake) deps() Deps {
	return Deps{
		GetRows: func(from, to time.Time) ([]samples.Row, error) {
			var rows []samples.Row
			for _, r := range f.rows {
				if !r.NodeTs.Before(from) && r.NodeTs.Before(to) {
					rows = append(rows, r)
				}
			}
			return rows, nil
		},
		SaveResult: func(r repository.EstimationRow) (bool, error) {
			f.saved = append(f.saved, r)
			return f.inserted, nil
		},
		Broadcast: func(any) { f.broadcast++ },
		Now: func() time.Time {
			f.now = f.now.Add(f.nowStep)
			return f.now
		},
	}
}

// addRow は窓 [T, T+1) に入るセンサ1（0002-A1）の10値を足す．span は最大−最小
func (f *fake) addRow(T time.Time, span int) {
	vals := make([]int, 10)
	for i := range vals {
		vals[i] = 100 + span*(i%2)
	}
	f.rows = append(f.rows, samples.Row{NodeID: "0002", SensorID: "A1", NodeTs: T.Add(900 * time.Millisecond), Values: vals})
}

func newRunner(f *fake, quiet *int) *Runner {
	p := estimator.DefaultParams()
	p.QuietResetSec = quiet
	var cal [12]estimator.SensorCal
	for k := range cal {
		cal[k] = estimator.SensorCal{Noise: 20, Upper: 120}
	}
	return New(f.deps(), 1, estimator.DefaultGrid(), p, cal, 0)
}

func newFake() *fake {
	return &fake{now: at(10, 57, 21, 50), inserted: true}
}

func TestTargetStart(t *testing.T) {
	if got := TargetStart(at(10, 57, 21, 0), 1, 3.0); !got.Equal(at(10, 57, 17, 0)) {
		t.Errorf("got %s", got)
	}
	if got := TargetStart(at(10, 57, 21, 900), 1, 3.0); !got.Equal(at(10, 57, 17, 0)) {
		t.Errorf("端数は切り下げのはず: %s", got)
	}
}

func TestNoData(t *testing.T) {
	f := newFake()
	newRunner(f, nil).Tick()
	if len(f.saved) != 0 || f.broadcast != 0 {
		t.Errorf("データ無しは保存しない: saved=%d broadcast=%d", len(f.saved), f.broadcast)
	}
}

func TestBelowThreshold(t *testing.T) {
	f := newFake()
	f.addRow(at(10, 57, 17, 0), 10) // 10/255×5 = 0.2 V < 0.7 V
	newRunner(f, nil).Tick()
	if len(f.saved) != 0 || f.broadcast != 0 {
		t.Errorf("反応なしは保存しない: saved=%d", len(f.saved))
	}
}

func TestActiveSaved(t *testing.T) {
	f := newFake()
	f.addRow(at(10, 57, 17, 0), 100)
	newRunner(f, nil).Tick()
	if len(f.saved) != 1 || f.broadcast != 1 {
		t.Fatalf("saved=%d broadcast=%d", len(f.saved), f.broadcast)
	}
	row := f.saved[0]
	if !row.Ts.Equal(at(10, 57, 17, 0)) || row.ComputedAt.IsZero() || !row.Active || row.EventID != 1 {
		t.Errorf("行の内容が不正: %+v", row)
	}
	if row.NSensors != 1 || row.NodeMask != 1 || row.S[0] == nil || *row.S[0] != 80 || row.S[1] != nil {
		t.Errorf("センサ情報が不正: n=%d mask=%d s=%v", row.NSensors, row.NodeMask, row.S)
	}
}

func TestNotInsertedNoBroadcast(t *testing.T) {
	f := newFake()
	f.inserted = false
	f.addRow(at(10, 57, 17, 0), 100)
	newRunner(f, nil).Tick()
	if len(f.saved) != 1 || f.broadcast != 0 {
		t.Errorf("保存済みの秒は配信しない: saved=%d broadcast=%d", len(f.saved), f.broadcast)
	}
}

// firstPMax は新しい Runner が最初の反応の秒で保存する p_max（一様からの1回更新の値）
func firstPMax() float64 {
	f := newFake()
	f.addRow(at(10, 57, 17, 0), 100)
	newRunner(f, nil).Tick()
	return f.saved[0].PMax
}

func TestQuietReset(t *testing.T) {
	want := firstPMax()
	for _, c := range []struct {
		name  string
		quiet *int
		reset bool
	}{{"30秒で戻る", intp(30), true}, {"NULLなら戻らない", nil, false}} {
		f := newFake()
		r := newRunner(f, c.quiet)
		f.addRow(at(10, 57, 17, 0), 100)
		r.Tick()
		for i := 1; i <= 31; i++ { // データの無い秒を31秒続ける
			f.now = f.now.Add(time.Second)
			r.Tick()
		}
		f.now = f.now.Add(time.Second)
		f.addRow(TargetStart(f.now, 1, 3.0), 100)
		r.Tick()
		got := f.saved[len(f.saved)-1].PMax
		if reset := got < want*1.0001 && got > want*0.9999; reset != c.reset {
			t.Errorf("%s: p_max=%v（一様からの値 %v）", c.name, got, want)
		}
	}
}

func TestCatchUpOverLimitResets(t *testing.T) {
	want := firstPMax()
	f := newFake()
	r := newRunner(f, nil)
	f.addRow(at(10, 57, 17, 0), 100)
	r.Tick()
	f.now = f.now.Add(15 * time.Second) // 15秒遅れ（10秒超）
	f.addRow(TargetStart(f.now, 1, 3.0), 100)
	r.Tick()
	got := f.saved[len(f.saved)-1].PMax
	if got < want*0.9999 || got > want*1.0001 {
		t.Errorf("最新の窓へ飛んで一様に戻るはず: p_max=%v, want %v", got, want)
	}
}

func TestCatchUpProcessesMissedWindows(t *testing.T) {
	f := newFake()
	r := newRunner(f, nil)
	r.Tick()
	f.now = f.now.Add(3 * time.Second)
	f.addRow(at(10, 57, 18, 0), 100)
	f.addRow(at(10, 57, 19, 0), 100)
	f.addRow(at(10, 57, 20, 0), 100)
	r.Tick()
	if len(f.saved) != 3 {
		t.Errorf("取りこぼした3つの窓を処理するはず: saved=%d", len(f.saved))
	}
}

func TestSlowLog(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(os.Stderr)

	f := newFake()
	f.nowStep = 1200 * time.Millisecond // Now を呼ぶたびに進むので，処理中に1秒を超える
	newRunner(f, nil).Tick()
	if !strings.Contains(buf.String(), "1秒以内に計算失敗") {
		t.Errorf("ログが出ていない: %q", buf.String())
	}
}

func TestEventCounter(t *testing.T) {
	e := NewEventCounter(5)
	ids := []int{e.Next(at(10, 0, 0, 0)), e.Next(at(10, 0, 1, 0)), e.Next(at(10, 0, 5, 0)), e.Next(at(10, 0, 6, 0))}
	// 1秒空きは同じ通過，4秒空くと次の通過
	if ids[0] != 6 || ids[1] != 6 || ids[2] != 7 || ids[3] != 7 {
		t.Errorf("event_id: %v", ids)
	}
}

func intp(v int) *int { return &v }

func TestSwitchResetsAndUsesNewConfig(t *testing.T) {
	want := firstPMax()
	f := newFake()
	r := newRunner(f, nil)
	f.addRow(at(10, 57, 17, 0), 100)
	r.Tick()

	r.Switch(2, estimator.DefaultGrid(), estimator.DefaultParams(), r.cal, 7)
	if r.ConfigID() != 2 {
		t.Errorf("config_id=%d, want 2", r.ConfigID())
	}
	f.now = f.now.Add(time.Second)
	f.addRow(TargetStart(f.now, 1, 3.0), 100)
	r.Tick()
	row := f.saved[len(f.saved)-1]
	if row.ConfigID != 2 || row.EventID != 8 {
		t.Errorf("切替後の行: config_id=%d event_id=%d", row.ConfigID, row.EventID)
	}
	if row.PMax < want*0.9999 || row.PMax > want*1.0001 {
		t.Errorf("切替で信念は一様に戻るはず: p_max=%v, want %v", row.PMax, want)
	}
}
