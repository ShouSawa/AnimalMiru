from flask import Flask, request, jsonify
import socket
import threading
import json
from datetime import datetime

app = Flask(__name__)
TCP_PORT = 9000
LOG_FILE = "/home/shousawa/sensor_data.jsonl"

def handle_tcp_client(conn, addr):
    """TCP接続してきたクライアント（BeagleBone）からデータを受信する関数"""
    print(f"TCP接続: {addr}")
    buffer = ""
    try:
        while True:
            chunk = conn.recv(4096).decode("utf-8", errors="ignore")
            if not chunk:           # 接続が切れたら終了
                break
            buffer += chunk
            # 改行区切りでJSONを1件ずつ処理
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    data["received_at"] = datetime.now().isoformat()
                    with open(LOG_FILE, "a") as f:
                        f.write(json.dumps(data, ensure_ascii=False) + "\n")
                    print(f"TCP受信保存: {data.get('gateway_id','?')}")
                except json.JSONDecodeError:
                    print(f"JSON解析失敗: {line}")
    finally:
        conn.close()
        print(f"TCP切断: {addr}")

def start_tcp_server():
    """TCPサーバーをバックグラウンドで起動する関数"""
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", TCP_PORT))
    server.listen(5)
    print(f"TCPサーバー起動: ポート{TCP_PORT}で待機中")
    while True:
        conn, addr = server.accept()
        t = threading.Thread(target=handle_tcp_client, args=(conn, addr), daemon=True)
        t.start()


@app.route("/api/sensor", methods=["POST"])
def receive_sensor():
    data = request.get_json()
    data["received_at"] = datetime.now().isoformat()
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(data, ensure_ascii=False) + "\n")
    print(f"HTTP受信保存: {data.get('gateway_id', '?')}")
    return jsonify({"status": "ok"}), 200

# Flaskとは別スレッドでTCPサーバーを起動
threading.Thread(target=start_tcp_server, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)