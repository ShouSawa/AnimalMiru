/*
1つのブラウザ接続を表すクライアント
*/

package websocket

import (
	"log"
	"time"

	gorillaws "github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	sendBufferSize = 32
)

// Client は1つのWebSocket接続と、Hubからのメッセージを流し込む送信バッファを持つ
type Client struct {
	hub  *Hub
	conn *gorillaws.Conn
	send chan []byte
}

func newClient(hub *Hub, conn *gorillaws.Conn) *Client {
	return &Client{
		hub:  hub,
		conn: conn,
		send: make(chan []byte, sendBufferSize),
	}
}

// readPump は接続断（クローズ・エラー）を検知するためだけに読み続ける。
// フロントエンドからのメッセージ送信は想定していない。
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			if gorillaws.IsUnexpectedCloseError(err, gorillaws.CloseGoingAway, gorillaws.CloseAbnormalClosure) {
				log.Printf("WS読み取りエラー: %v", err)
			}
			break
		}
	}
}

// writePump はHubから受け取ったメッセージをこの接続に書き込み、
// 定期的なPingで接続を維持する。
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub側でチャネルがcloseされた＝この接続を終了させる
				c.conn.WriteMessage(gorillaws.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(gorillaws.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(gorillaws.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
