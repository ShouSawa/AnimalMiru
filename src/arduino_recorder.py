import serial
import serial.tools.list_ports
import threading
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

# 各Arduinoのシリアルポート名を指定
target_ports = ['COM5', 'COM6', 'COM7', 'COM8']
ports = [port for port in target_ports if port in available_ports]

if not ports:
    print(f"エラー: 指定されたポート {target_ports} のいずれも利用できません。")
    print(f"利用可能なポート: {available_ports}")
    exit(1)

if len(ports) < 4:
    print(f"警告: 4つのポートのうち {len(ports)} つのポートのみ利用可能です: {ports}")

print(f"使用するポート: {ports}")

# シリアル接続を試行
serials = []
for port in ports:
    try:
        ser = serial.Serial(port, 9600, timeout=1)
        serials.append(ser)
        print(f"{port} に接続しました")
    except Exception as e:
        print(f"エラー: {port} への接続に失敗しました: {e}")
        exit(1)

# 各回路からの最新データを保持（circuit no, voltage）
# Arduino A: circuit 1-3, B: circuit 4-6, C: circuit 7-9, D: circuit 10-12
latest_circuit_data = {}  # {circuit_no: (circuit_value, voltage_value)}
data_receive_errors = {}  # {port_index: error_count}
last_data_time = {}  # {circuit_no: last_received_time}

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

def read_from_arduino(idx, ser):
    global latest_circuit_data, data_receive_errors, last_data_time
    port_name = ser.port
    data_receive_errors[idx] = 0
    
    while True:
        try:
            line = ser.readline().decode('utf-8').strip()
            if line:
                parsed = parse_arduino_data(line)
                if parsed:
                    circuit_no, circuit_value, voltage = parsed
                    latest_circuit_data[circuit_no] = (circuit_value, voltage)
                    last_data_time[circuit_no] = time.time()
                    # エラーカウントをリセット
                    data_receive_errors[idx] = 0
                else:
                    data_receive_errors[idx] += 1
                    if data_receive_errors[idx] > 10:
                        print(f"エラー: {port_name} からのデータ解析に連続で失敗しています")
            else:
                # データが受信できない場合
                data_receive_errors[idx] += 1
                if data_receive_errors[idx] > 20:
                    print(f"エラー: {port_name} からデータが受信できません（連続失敗回数: {data_receive_errors[idx]}）")
        except Exception as e:
            data_receive_errors[idx] += 1
            print(f"エラー: {port_name} でデータ受信エラーが発生しました: {e}")
            if data_receive_errors[idx] > 5:
                print(f"致命的エラー: {port_name} で連続してエラーが発生しています")
                break


# ファイル名の入力を促す
base_filename = input("出力CSVファイルの基本名を入力してください（拡張子なし）: ")
current_time = datetime.now().strftime("%Y%m%d_%H%M%S")

# 保存先フォルダのパスを設定
output_dir = "../experiment_data/csv_data/"
os.makedirs(output_dir, exist_ok=True)  # フォルダが存在しない場合は作成

filename = os.path.join(output_dir, f"{base_filename}_{current_time}.csv")
print(f"出力ファイル名: {filename}")

# 各Arduinoごとにスレッドを立ててデータを受信
threads = []
for i, ser in enumerate(serials):
    t = threading.Thread(target=read_from_arduino, args=(i, ser))
    t.daemon = True
    t.start()
    threads.append(t)

# 初期接続確認のための待機時間
print("初期データ受信を確認中... (5秒待機)")
time.sleep(5)
print("実験データ記録中...")

# 各回路からデータが受信されているかチェック
expected_circuits = list(range(1, 13))  # 1-12の回路
missing_circuits = [circuit for circuit in expected_circuits if circuit not in latest_circuit_data]

if missing_circuits:
    print(f"警告: 以下の回路からデータが受信されていません: {missing_circuits}")
    choice = input("このまま続行しますか？ (y/n): ")
    if choice.lower() != 'y':
        print("プログラムを終了します。")
        exit(1)

# CSVファイルに記録
with open(filename, 'w', newline='') as f:
    writer = csv.writer(f)
    # ヘッダー
    header = ['date', 'timestamp']
    for i in range(1, 13):  # circuit 1-12
        header += [f'circuit_no{i}', f'voltage_no{i}']
    writer.writerow(header)

    try:
        data_timeout_check = 0
        while True:
            # 現在の日時とタイムスタンプ
            now = datetime.now()
            date_str = now.strftime('%Y-%m-%d')
            timestamp_str = now.strftime('%H:%M:%S')
            
            # データ行の作成
            row = [date_str, timestamp_str]
            
            # データが長時間更新されていない回路をチェック
            current_time_stamp = time.time()
            stale_circuits = []
            for circuit_no in range(1, 13):
                if circuit_no in last_data_time:
                    if current_time_stamp - last_data_time[circuit_no] > 10:  # 10秒以上更新なし
                        stale_circuits.append(circuit_no)
            
            if stale_circuits:
                print(f"警告: 以下の回路のデータが10秒以上更新されていません: {stale_circuits}")
            
            # 12個の回路のデータを順番に取得
            for circuit_no in range(1, 13):
                if circuit_no in latest_circuit_data:
                    circuit_value, voltage_value = latest_circuit_data[circuit_no]
                    row += [circuit_value, voltage_value]
                else:
                    row += ['', '']  # データがない場合は空文字
            
            writer.writerow(row)
            f.flush()
            
            # 定期的に全体の状態をチェック
            data_timeout_check += 1
            if data_timeout_check % 20 == 0:  # 10秒ごと（0.5秒×20回）
                total_errors = sum(data_receive_errors.values())
                if total_errors > 100:
                    print(f"エラー: 累積エラー数が多すぎます（合計: {total_errors}）")
                    print("データ受信に問題がある可能性があります。")
            
            time.sleep(0.1)  # 0.1秒ごとに記録

    # Ctrl+Cでプログラム終了
    except KeyboardInterrupt:
        print('Logging stopped.')
        print(f"最終エラー統計: {data_receive_errors}")
    except Exception as e:
        print(f"予期しないエラーが発生しました: {e}")
        print(f"エラー統計: {data_receive_errors}")
