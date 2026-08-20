// tcp/tcp_server.go
package tcp

import (
	"bufio"
	"encoding/json"
	"log"
	"net"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/handler"
)

// Start はTCPサーバーを起動する関数（goroutineで呼ぶ）
func Start(port string) {
	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("TCPサーバー起動失敗: %v", err)
	}
	defer listener.Close()
	log.Printf("TCPサーバー起動: ポート%sで待ち受け中", port)

	for {
		conn, err := listener.Accept() // 接続を待ち受ける
		if err != nil {
			log.Printf("TCP接続受付エラー: %v", err)
			continue
		}
		go handleConnection(conn) // 接続ごとにgoroutineで処理
	}
}

// handleConnection は1つのTCP接続からデータを受信して保存する
func handleConnection(conn net.Conn) {
	defer conn.Close()
	log.Printf("TCP接続: %s", conn.RemoteAddr())

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 1024*64), 1024*64) // 最大64KBのバッファ

	for scanner.Scan() { // 改行区切りで1行ずつ読む
		line := scanner.Text()
		if line == "" {
			continue
		}

		// JSONをパース
		var req handler.IngestRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			log.Printf("JSON解析失敗: %v / 受信データ: %s", err, line)
			continue
		}

		// received_atを現在時刻で補完
		if req.ReceivedAt == "" {
			req.ReceivedAt = time.Now().Format(time.RFC3339Nano)
		}

		// DB保存（handler共通処理を呼ぶ）
		saved, total := handler.SaveIngestRequest(&req)
		log.Printf("TCP受信・保存完了: saved=%d total=%d", saved, total)
	}

	if err := scanner.Err(); err != nil {
		log.Printf("TCP読み取りエラー: %v", err)
	}
	log.Printf("TCP切断: %s", conn.RemoteAddr())
}