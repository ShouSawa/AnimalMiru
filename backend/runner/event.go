// runner/event.go
package runner

import "time"

// EventGapSec は反応の秒がこれを超えて空いたら別の通過とみなす間隔
// 要確認: 実データで通過の区切りを見て決める
const EventGapSec = 3 * time.Second

// EventCounter は連続する反応の秒を1回の通過としてまとめる番号を振る
type EventCounter struct {
	id         int
	lastActive time.Time
}

// NewEventCounter は直近の event_id（結果が無ければ0）から続きの番号を振るカウンタを作る
func NewEventCounter(lastID int) *EventCounter {
	return &EventCounter{id: lastID}
}

// Next は反応のあった秒 t の event_id を返す
func (e *EventCounter) Next(t time.Time) int {
	if e.lastActive.IsZero() || t.Sub(e.lastActive) > EventGapSec {
		e.id++
	}
	e.lastActive = t
	return e.id
}
