// samples/timeline_test.go
package samples

import (
	"testing"
	"time"
)

var jst = time.FixedZone("JST", 9*3600)

func at(sec, ms int) time.Time {
	return time.Date(2026, 11, 18, 10, 0, sec, ms*1e6, jst)
}

func TestSampleTime(t *testing.T) {
	nodeTs := at(0, 500)
	cases := []struct {
		j    int
		want time.Time
	}{{9, at(0, 500)}, {0, at(0, 185)}, {5, at(0, 360)}}
	for _, c := range cases {
		if got := SampleTime(nodeTs, 10, c.j); !got.Equal(c.want) {
			t.Errorf("j=%d: got %s, want %s", c.j, got, c.want)
		}
	}
	if got := FirstSampleTime(nodeTs, 10); !got.Equal(at(0, 185)) {
		t.Errorf("FirstSampleTime: got %s", got)
	}
}

func TestQueryRange(t *testing.T) {
	from, to := QueryRange(at(0, 0), at(1, 0))
	if !from.Equal(at(0, 0)) || !to.Equal(at(1, 315)) {
		t.Errorf("got [%s, %s)", from, to)
	}
}

func TestCollectWindow(t *testing.T) {
	values := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	rows := []Row{
		{"0002", "A1", at(0, 0).Add(-50 * time.Millisecond), values}, // 最後の値がTより前なので入らない
		{"0002", "A1", at(0, 500), values},                           // 全部入る
		{"0002", "A1", at(1, 100), values},                           // 後ろの5個が窓の外に出る
	}
	got := Collect(rows, at(0, 0), at(1, 0))[Key{"0002", "A1"}]
	// 2行目: 10個．3行目: t_j = 1.100-(9-j)*0.035 < 1.000 を満たす j=0..6 の7個
	if len(got) != 17 {
		t.Fatalf("len=%d, want 17", len(got))
	}
	if !got[0].T.Equal(at(0, 185)) || got[0].V != 1 {
		t.Errorf("先頭: %+v", got[0])
	}
}

// DeltaFix を変えても，GetSeries（Collect）と推定が同じ関数で時刻を置くので一致する
func TestCollectUsesSampleTime(t *testing.T) {
	row := Row{"0003", "A2", at(0, 500), []int{10, 20, 30}}
	for j, s := range Collect([]Row{row}, at(0, 0), at(1, 0))[Key{"0003", "A2"}] {
		if want := SampleTime(row.NodeTs, 3, j); !s.T.Equal(want) {
			t.Errorf("j=%d: got %s, want %s", j, s.T, want)
		}
	}
}
