// estimator/mapcodec.go
package estimator

import (
	"bytes"
	"compress/zlib"
	"errors"
	"fmt"
	"io"
	"math"
)

// EncodeMap は信念を q_i = round(255·bel_i/max) の uint8 配列にして zlib 圧縮する
func EncodeMap(bel []float64) ([]byte, error) {
	maxBel := 0.0
	for _, b := range bel {
		maxBel = max(maxBel, b)
	}
	if maxBel <= 0 {
		return nil, errors.New("確率の最大値が0以下です")
	}

	q := make([]byte, len(bel))
	for i, b := range bel {
		q[i] = byte(math.Round(255 * b / maxBel))
	}

	var buf bytes.Buffer
	w := zlib.NewWriter(&buf)
	if _, err := w.Write(q); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// DecodeMap は zlib を展開して n 個の q_i を返す．長さが n でなければエラー
func DecodeMap(z []byte, n int) ([]uint8, error) {
	r, err := zlib.NewReader(bytes.NewReader(z))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	q, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	if len(q) != n {
		return nil, fmt.Errorf("map_z の長さが不正です: %d（期待 %d）", len(q), n)
	}
	return q, nil
}
