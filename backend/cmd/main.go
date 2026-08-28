// cmd/main.go
package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/ShouSawa/AnimalMiru/backend/db"
	"github.com/ShouSawa/AnimalMiru/backend/handler"
	"github.com/ShouSawa/AnimalMiru/backend/tcp"
	"github.com/ShouSawa/AnimalMiru/backend/websocket"
	"github.com/joho/godotenv"
)

func main() {
	// .envファイルを読み込む（失敗しても環境変数から読むので続行）
	if err := godotenv.Load(); err != nil {
		log.Println(".envファイルが見つかりません（環境変数から読み込みます）")
	}

	// DB接続を初期化（ここで失敗するとプログラムが終了する）
	db.Init()

	// WebSocket配信ハブを起動
	hub := websocket.NewHub()
	go hub.Run()

	// TCPサーバーを起動（9000番）。保存成功時はhub経由でブラウザへ配信する
	go tcp.Start("9000", hub)

	// WebSocketサーバーを起動（8081番、Nginx経由で /ws/realtime にマッピングする想定）
	mux := http.NewServeMux()
	mux.HandleFunc("/ws/realtime", websocket.ServeWS(hub))
	mux.HandleFunc("/api/sensor-data/recent", handler.ServeRecentLogs())
	go func() {
		log.Println("WebSocketサーバー起動: ポート8081で待ち受け中（/ws/realtime）")
		if err := http.ListenAndServe(":8081", mux); err != nil {
			log.Fatalf("WebSocketサーバー起動失敗: %v", err)
		}
	}()

	// Ctrl+C や systemctl stop を受け取るまで待機
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("シャットダウンします")
}