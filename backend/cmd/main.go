// cmd/main.go
package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/ShouSawa/AnimalMiru/backend/db"
	"github.com/ShouSawa/AnimalMiru/backend/tcp"
	"github.com/joho/godotenv"
)

func main() {
	// .envファイルを読み込む（失敗しても環境変数から読むので続行）
	if err := godotenv.Load(); err != nil {
		log.Println(".envファイルが見つかりません（環境変数から読み込みます）")
	}

	// DB接続を初期化（ここで失敗するとプログラムが終了する）
	db.Init()

	// TCPサーバーを起動（9000番）
	go tcp.Start("9000")

	// Ctrl+C や systemctl stop を受け取るまで待機
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("シャットダウンします")
}