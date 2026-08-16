// cmd/main.go
package main

import (
	"github.com/gin-gonic/gin"
	"github.com/ShouSawa/AnimalMiru/backend/handler"
)

func main() {
	r := gin.Default()

	// APIエンドポイントの登録
	api := r.Group("/api")
	{
			api.POST("/ingest", handler.Ingest)  // センサデータ受け取り口
	}

	// 8081番ポートで起動（8080はFlaskが使用中のため）
	r.Run(":8081")
}