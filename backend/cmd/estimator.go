// cmd/estimator.go
package main

import (
	"context"
	"errors"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/runner"
	"github.com/ShouSawa/AnimalMiru/backend/websocket"
)

// startEstimator は環境変数 ESTIMATOR_CONFIG_ID の設定で経路推定を起動する。
// 使用中の config_id を返す関数、使用する設定を切り替える関数、センサデータの保存後に呼ぶ通知関数を返す。
// 推定はこの通知（TCP受信）をきっかけに計算する。
// 未設定や設定の読み込み失敗のときは推定を起動せず、通知は何もせず、切り替えはエラーになる（受信・配信・APIは通常どおり動く）
func startEstimator(hub *websocket.Hub) (active func() int, activate func(int) error, notify func()) {
	var run *runner.Runner
	configID := 0
	notify = func() {
		if run != nil {
			run.Notify()
		}
	}
	active = func() int {
		if run == nil {
			return configID
		}
		return run.ConfigID()
	}
	activate = func(id int) error {
		if run == nil {
			return errors.New("経路推定が起動していません")
		}
		p, g, cal, err := repository.LoadEstimator(id)
		if err != nil {
			return err
		}
		lastEventID, err := repository.MaxEventID(id)
		if err != nil {
			return err
		}
		run.Switch(id, g, p, cal, lastEventID)
		log.Printf("経路推定の設定を切り替え: config_id=%d", id)
		return nil
	}

	v := os.Getenv("ESTIMATOR_CONFIG_ID")
	if v == "" {
		log.Println("ESTIMATOR_CONFIG_ID が未設定のため、経路推定は起動しません")
		return
	}
	configID, err := strconv.Atoi(v)
	if err != nil {
		log.Printf("ESTIMATOR_CONFIG_ID が数値ではありません（%q）。経路推定は起動しません", v)
		return
	}
	p, g, cal, err := repository.LoadEstimator(configID)
	if err != nil {
		log.Printf("経路推定を起動できません: %v", err)
		return
	}
	lastEventID, err := repository.MaxEventID(configID)
	if err != nil {
		log.Printf("経路推定を起動できません: %v", err)
		return
	}

	deps := runner.Deps{
		GetRows:    repository.GetRows,
		SaveResult: repository.SaveResult,
		Broadcast:  hub.Broadcast,
		Now:        time.Now,
	}
	run = runner.New(deps, configID, g, p, cal, lastEventID)
	go run.Run(context.Background())
	log.Printf("経路推定を起動: config_id=%d", configID)
	return
}
