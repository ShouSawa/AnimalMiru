# センサデータ受信用プログラム
from flask import Flask, request, jsonify
import json
import os
from datetime import datetime

app = Flask(__name__)
LOG_FILE = "/home/shousawa/sensor_data.jsonl"  # 受信データの保存先（要変更）

@app.route("/api/sensor", methods=["POST"])
def receive_sensor():
  data = request.get_json()                        # BeagleBoneからのJSONを受け取る
  data["received_at"] = datetime.now().isoformat() # 受信時刻を追記
  with open(LOG_FILE, "a") as f:
    f.write(json.dumps(data) + "\n")             # 1行1レコードで追記保存
  print(f"受信: {data}")
  return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
  app.run(host="0.0.0.0", port=8080)              # 全インターフェースで8080番待ち受け