// frame/from_row_test.go
package frame

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/estimator"
	"github.com/ShouSawa/AnimalMiru/backend/repository"
)

func TestFromRowJSON(t *testing.T) {
	g := estimator.DefaultGrid()
	z, err := estimator.EncodeMap(g.Uniform())
	if err != nil {
		t.Fatal(err)
	}
	s := int16(80)
	row := repository.EstimationRow{
		Ts: time.UnixMilli(1763431037000), ComputedAt: time.UnixMilli(1763431041400),
		Active: true, S: [12]*int16{&s}, MapZ: z, EventID: 12,
	}

	f, err := FromRow(row, 1, true, g.N())
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(f)
	out := string(b)
	for _, want := range []string{`"ts":1763431037`, `"computed_at":1763431041.4`, `"s":[80,null,`, `"map_q":[255,255,`} {
		if !strings.Contains(out, want) {
			t.Errorf("JSON に %s が無い: %.200s", want, out)
		}
	}
	if len(f.MapQ) != g.N() {
		t.Errorf("map_q の長さ %d", len(f.MapQ))
	}

	f, _ = FromRow(row, 1, false, g.N())
	if b, _ := json.Marshal(f); strings.Contains(string(b), "map_q") {
		t.Error("withMap=false なら map_q を含めないはず")
	}
}
