from flask import Flask, request
import csv
import datetime
import os

app = Flask(__name__)

# CSVファイル名（日時をファイル名に追加）
CSV_FILE = f'sensor_data_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'

# CSVの初期化（ファイルがなければヘッダーを作る）
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['timestamp', 'voltage'])  # ヘッダー

@app.route('/data', methods=['POST'])
def receive_data():
    try:
        # 4GIMから送られてくるデータを受け取る
        # ここでは 'val' というキーで電圧値が送られてくると仮定
        voltage = request.form.get('val')
        
        # データがない場合の処理
        if voltage is None:
            # JSON形式で来る場合の対応（念のため）
            json_data = request.get_json()
            if json_data:
                voltage = json_data.get('val')

        if voltage:
            # 現在時刻を取得
            now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # CSVに追記
            with open(CSV_FILE, 'a', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([now, voltage])
            
            print(f"受信成功: {now}, 電圧: {voltage}")
            return "OK", 200
        else:
            print("データが含まれていません")
            return "No Data", 400

    except Exception as e:
        print(f"エラー発生: {e}")
        return "Error", 500

if __name__ == '__main__':
    # ポート5000でサーバーを起動
    app.run(port=5000, debug=True)