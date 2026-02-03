import serial
import serial.tools.list_ports
import csv
import time
import re
import os
from datetime import datetime

# 利用可能なシリアルポートを検出
def get_available_ports():
    available_ports = []
    ports = serial.tools.list_ports.comports()
    for port in ports:
        print(f"検出されたポート: {port.device} - {port.description}")
        available_ports.append(port.device)
    return available_ports

# 利用可能なポートを取得
print("利用可能なシリアルポートを検索中...")
available_ports = get_available_ports()

if not available_ports:
    print("エラー: 利用可能なシリアルポートが見つかりません。")
    print("Arduinoがコンピュータに接続されているか確認してください。")
    exit(1)

# 利用可能な最初のポートを使用
port = available_ports[0]
print(f"\n使用するポート: {port}")

# シリアル接続を試行
try:
    ser = serial.Serial(port, 9600, timeout=1)
    print(f"{port} に接続しました")
except Exception as e:
    print(f"エラー: {port} への接続に失敗しました: {e}")
    exit(1)

# 最新データを保持
latest_data = None  # (circuit_value, voltage_value)
data_receive_errors = 0
last_data_time = None

def parse_arduino_data(line):
    """Arduinoからのデータを解析する関数
    実際の形式: 'circuit No.1 :  348 , 1.7399805[V]' -> (1, 348, 1.7399805)
    """
    # 正しいパターン：コロンとスペースを考慮
    pattern = r'circuit No\.(\d+)\s*:\s*(\d+)\s*,\s*([\d.]+)\[V\]'
    match = re.match(pattern, line)
    if match:
        circuit_no = int(match.group(1))
        circuit_value = int(match.group(2))
        voltage = float(match.group(3))
        return circuit_no, circuit_value, voltage
    return None

# ファイル名の入力を促す
base_filename = input("出力CSVファイルの基本名を入力してください（拡張子なし）: ")
current_time = datetime.now().strftime("%Y%m%d_%H%M%S")

# 保存先フォルダのパスを設定
output_dir = "../experiment_data/csv_data/single-data/"
os.makedirs(output_dir, exist_ok=True)  # フォルダが存在しない場合は作成

filename = os.path.join(output_dir, f"{base_filename}_{current_time}.csv")
print(f"出力ファイル名: {filename}")

# 初期接続確認のための待機時間
print("初期データ受信を確認中... (3秒待機)")
time.sleep(3)

# 初期データの受信確認
test_count = 0
while test_count < 10:
    try:
        line = ser.readline().decode('utf-8').strip()
        if line:
            parsed = parse_arduino_data(line)
            if parsed:
                circuit_no, circuit_value, voltage = parsed
                latest_data = (circuit_value, voltage)
                last_data_time = time.time()
                print(f"データ受信確認: Circuit {circuit_no}, Value: {circuit_value}, Voltage: {voltage}V")
                break
        test_count += 1
        time.sleep(0.5)
    except Exception as e:
        print(f"初期データ受信エラー: {e}")
        test_count += 1

if latest_data is None:
    print("警告: データが受信できていません。")
    choice = input("このまま続行しますか？ (y/n): ")
    if choice.lower() != 'y':
        print("プログラムを終了します。")
        exit(1)

print("実験データ記録開始...")
print("記録を停止するには Ctrl+C を押してください")

# CSVファイルに記録
with open(filename, 'w', newline='') as f:
    writer = csv.writer(f)
    # ヘッダー
    header = ['date', 'timestamp', 'circuit_value', 'voltage']
    writer.writerow(header)

    try:
        data_timeout_check = 0
        while True:
            # Arduinoからデータを読み取る
            try:
                line = ser.readline().decode('utf-8').strip()
                if line:
                    parsed = parse_arduino_data(line)
                    if parsed:
                        circuit_no, circuit_value, voltage = parsed
                        latest_data = (circuit_value, voltage)
                        last_data_time = time.time()
                        data_receive_errors = 0
                    else:
                        data_receive_errors += 1
                        if data_receive_errors > 10:
                            print(f"警告: データ解析に連続で失敗しています（エラー数: {data_receive_errors}）")
                else:
                    data_receive_errors += 1
                    if data_receive_errors > 20:
                        print(f"警告: データが受信できません（連続失敗回数: {data_receive_errors}）")
            except Exception as e:
                data_receive_errors += 1
                print(f"エラー: データ受信エラーが発生しました: {e}")
                if data_receive_errors > 5:
                    print(f"致命的エラー: 連続してエラーが発生しています")
                    break
            
            # 現在の日時とタイムスタンプ
            now = datetime.now()
            date_str = now.strftime('%Y-%m-%d')
            timestamp_str = now.strftime('%H:%M:%S')
            
            # データ行の作成
            if latest_data:
                circuit_value, voltage_value = latest_data
                row = [date_str, timestamp_str, circuit_value, voltage_value]
            else:
                row = [date_str, timestamp_str, '', '']  # データがない場合は空文字
            
            writer.writerow(row)
            f.flush()
            
            # データが長時間更新されていないかチェック
            data_timeout_check += 1
            if data_timeout_check % 100 == 0:  # 10秒ごと（0.1秒×100回）
                if last_data_time:
                    current_time_stamp = time.time()
                    if current_time_stamp - last_data_time > 10:
                        print(f"警告: データが10秒以上更新されていません")
            
            time.sleep(0.1)  # 0.1秒ごとに記録

    # Ctrl+Cでプログラム終了
    except KeyboardInterrupt:
        print('\nLogging stopped.')
        print(f"累積エラー数: {data_receive_errors}")
    except Exception as e:
        print(f"\n予期しないエラーが発生しました: {e}")
        print(f"累積エラー数: {data_receive_errors}")
    finally:
        ser.close()
        print(f"シリアルポートを閉じました")
        print(f"データは {filename} に保存されました")
