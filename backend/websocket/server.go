/*
/ws/realtime のHTTPハンドラ（HTTP処理からWebSocketへのUpgrade処理）
*/

package websocket

import (
	"log"
	"net/http"

	gorillaws "github.com/gorilla/websocket"
)

var upgrader = gorillaws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Nginx経由・別オリジンからの接続を許可する
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ServeWS は /ws/realtime にUpgradeし、接続をHubへ登録するハンドラを返す
func ServeWS(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WS Upgrade失敗: %v", err)
			return
		}

		client := newClient(hub, conn)
		hub.register <- client

		go client.writePump()
		go client.readPump()
	}
}
