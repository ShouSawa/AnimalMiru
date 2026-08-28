/*
DB保存されたときに配信するハブ
*/

package websocket

import (
	"encoding/json"
	"log"
)

// Hub は接続中の全WebSocketクライアントを管理し、メッセージを配信する。
// clientsマップはRun()のgoroutine内でしか触らないので、mutexは使わない。
type Hub struct {
	clients    map[*Client]struct{}
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
}

// NewHub はHubを生成する。呼び出し側で go hub.Run() して使うこと。
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]struct{}),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 64),
	}
}

// Run はHubの配信ループ。goroutineで起動する。
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.clients[c] = struct{}{}
			log.Printf("WS接続登録: 現在%d件", len(h.clients))

		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
				log.Printf("WS接続解除: 現在%d件", len(h.clients))
			}

		case msg := <-h.broadcast:
			for c := range h.clients {
				select {
				case c.send <- msg:
				default:
					// 送信バッファが詰まっている＝処理が遅いクライアントとみなして切断する
					delete(h.clients, c)
					close(c.send)
				}
			}
		}
	}
}

// Broadcast は任意の値をJSONエンコードして接続中の全クライアントに配信する
func (h *Hub) Broadcast(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("WSブロードキャストJSON変換失敗: %v", err)
		return
	}
	h.broadcast <- data
}
