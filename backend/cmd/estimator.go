// cmd/estimator.go
package main

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/ShouSawa/AnimalMiru/backend/repository"
	"github.com/ShouSawa/AnimalMiru/backend/runner"
	"github.com/ShouSawa/AnimalMiru/backend/websocket"
)

// startEstimator は estimator_config で main=true の設定を使って経路推定を起動する。
// 使用する設定を切り替える関数（DBの main も付け替える）と、センサデータの保存後に呼ぶ通知関数を返す。
// 推定はこの通知（TCP受信）をきっかけに計算する。
// main の設定が無い・読み込めないときは推定を起動せず（受信・配信・APIは通常どおり動く）、切り替えたときに起動する
func startEstimator(hub *websocket.Hub) (activate func(int) error, notify func()) {
	deps := runner.Deps{
		GetRows:    repository.GetRows,
		SaveResult: repository.SaveResult,
		Broadcast:  hub.Broadcast,
		Now:        time.Now,
	}
	var mu sync.Mutex // run は HTTP（切り替え）と TCP（通知）の両方から触るので保護する
	var run *runner.Runner

	// use は id の設定で推定する（未起動なら起動する）。setMain が true なら先に DB の main を id へ付け替える
	use := func(id int, setMain bool) error {
		p, g, cal, err := repository.LoadEstimator(id)
		if err != nil {
			return err
		}
		lastEventID, err := repository.MaxEventID(id)
		if err != nil {
			return err
		}
		if setMain {
			if err := repository.SetMainConfig(id); err != nil {
				return err
			}
		}
		mu.Lock()
		defer mu.Unlock()
		if run == nil {
			run = runner.New(deps, id, g, p, cal, lastEventID)
			go run.Run(context.Background())
		} else {
			run.Switch(id, g, p, cal, lastEventID)
		}
		log.Printf("経路推定の設定: config_id=%d", id)
		return nil
	}

	notify = func() {
		mu.Lock()
		defer mu.Unlock()
		if run != nil {
			run.Notify()
		}
	}
	activate = func(id int) error { return use(id, true) }

	id, err := repository.MainConfigID()
	if err == nil {
		err = use(id, false)
	}
	if err != nil {
		log.Printf("経路推定を起動できません（estimator_config の main=true の設定を確認してください）: %v", err)
	}
	return
}
