// samples/dedupe_test.go
package samples

import "testing"

func TestDropDuplicates(t *testing.T) {
	a := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	b := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 11}
	cases := []struct {
		name string
		rows []Row
		want int
	}{
		{"0.12秒差の同値は後を捨てる", []Row{{"0002", "A1", at(0, 0), a}, {"0002", "A1", at(0, 120), a}}, 1},
		{"0.47秒差の同値は両方残す", []Row{{"0002", "A1", at(0, 0), a}, {"0002", "A1", at(0, 470), a}}, 2},
		{"値が違えば残す", []Row{{"0002", "A1", at(0, 0), a}, {"0002", "A1", at(0, 120), b}}, 2},
		{"センサが違えば残す", []Row{{"0002", "A1", at(0, 0), a}, {"0002", "A2", at(0, 120), a}}, 2},
	}
	for _, c := range cases {
		if got := len(DropDuplicates(c.rows)); got != c.want {
			t.Errorf("%s: got %d, want %d", c.name, got, c.want)
		}
	}
}

func TestParseValues(t *testing.T) {
	got := ParseValues("72, 71,x,73")
	if len(got) != 3 || got[0] != 72 || got[1] != 71 || got[2] != 73 {
		t.Errorf("got %v", got)
	}
}
