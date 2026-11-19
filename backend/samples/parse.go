// samples/parse.go
package samples

import (
	"strconv"
	"strings"
)

// ParseValues は value_dec（"72,71,73,..."）を数値列に変換する．数値でない要素は捨てる
func ParseValues(s string) []int {
	var values []int
	for _, part := range strings.Split(s, ",") {
		v, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil {
			continue
		}
		values = append(values, v)
	}
	return values
}
