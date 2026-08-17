// cmd/main.go
package main

import (
	"github.com/joho/godotenv"
	"github.com/ShouSawa/AnimalMiru/backend/db"
	"github.com/ShouSawa/AnimalMiru/backend/handler"
	"github.com/gin-gonic/gin"
	"log"
)

func main() {
	// .envファイルを読み込む（失敗しても環境変数から読むので続行）
	if err := godotenv.Load(); err != nil {
		log.Println(".envファイルが見つかりません（環境変数から読み込みます）")
	}

	// DB接続を初期化（ここで失敗するとプログラムが終了する）
	db.Init()

	r := gin.Default()
	api := r.Group("/api")
	{
		api.POST("/ingest", handler.Ingest)
	}

	r.Run(":8081")
}