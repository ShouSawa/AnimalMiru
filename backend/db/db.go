// db/db.go
package db

import (
	"fmt"
	"log"
	"os"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"  // PostgreSQLドライバの登録（_はimport副作用のみ使用）
)

// DB はアプリ全体で使い回す接続オブジェクト
var DB *sqlx.DB

// Init は起動時に1回だけ呼ぶDB接続初期化関数
func Init() {
	// .envから読み込んだ環境変数で接続文字列を組み立てる
	dsn := fmt.Sprintf(
		"host=%s port=%s dbname=%s user=%s password=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
	)

	var err error
	DB, err = sqlx.Connect("postgres", dsn)
	if err != nil {
		log.Fatalf("DB接続失敗: %v", err)  // 接続失敗したらプログラムを終了
	}

	log.Println("DB接続成功")
}