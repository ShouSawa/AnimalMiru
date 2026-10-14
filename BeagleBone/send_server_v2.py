#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
send_server_v2.py
IM920sで受信した赤外線焦電センサデータを、EX4Cクレードル経由のネット回線で
みらいサーバーへ直接TCP送信するゲートウェイプログラム（BeagleBone上で動作）

起動と同時にセンサデータの収集・送信を開始する（systemdでの自動起動を想定）
USR1 LED : サーバーとのTCP接続中のみ点灯
"""

import serial          # シリアル通信用ライブラリ
import socket          # サーバーへの直接TCP通信用
import json            # 送信用JSON文字列の生成用
import time            # 待機・タイムスタンプ用ライブラリ
import queue           # producer-consumer間の受け渡し用
import threading       # 受信と送信の並列実行用
import Adafruit_BBIO.GPIO as GPIO  # BeagleBoneのGPIO制御用ライブラリ
import sys             # プログラム終了処理用ライブラリ
import logging         # ログ出力用ライブラリ
from datetime import datetime

# ===================== 設定項目（環境に合わせて変更） =====================
SERIAL_PORT = "/dev/ttyS4"          # IM920sが接続されているBeagleBoneのUARTポート
SERIAL_BAUDRATE = 19200             # IM920sの通信速度(bps)
SERIAL_TIMEOUT = 1                  # シリアル読み取りのタイムアウト(秒)

SERVER_HOST = "153.125.138.233"     # 送信先サーバーのホスト
SERVER_PORT = 9000                  # 送信先TCPポート
SOCKET_TIMEOUT = 10                 # 接続・送信のタイムアウト(秒)
RECONNECT_INTERVAL = 10             # 切断時に再接続を試みる間隔(秒)
GATEWAY_ID = "GW01"                 # このゲートウェイ自身を識別するID(要変更)

LOG_FILE = f"/home/debian/log/im920_gateway_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
EXPECTED_NODE_IDS = ("0002", "0003", "0004", "0005")  # 1回の送信でまとめる4ノード
BUFFER_FLUSH_INTERVAL = 2           # 2秒ごとにまとめて送信する
BUFFER_MAX_SIZE = 5                 # または約1秒分たまる件数で送信する
BUFFER_LIMIT = 500                  # 送信失敗中に保持する最大件数(超えたら古いものから破棄)
# ==========================================================================

data_buffer = []
last_flush_time = time.time()
last_connect_try = 0
sock = None

def setup_logger():
    """ログ出力の設定を行う関数"""
    logging.basicConfig(                     # ログの基本設定
        filename=LOG_FILE,                   # 出力先ファイルを指定
        level=logging.INFO,                  # INFOレベル以上を記録
        format="%(asctime)s [%(levelname)s] %(message)s"  # 日時付きフォーマット
    )
    logging.getLogger().addHandler(logging.StreamHandler())  # 画面にも同時出力

def open_serial():
    """IM920sとのシリアルポートを開く関数"""
    ser = serial.Serial(                      # シリアルポートをオープン
        port=SERIAL_PORT,                     # ポート名を指定
        baudrate=SERIAL_BAUDRATE,             # ボーレートを指定
        timeout=SERIAL_TIMEOUT                # タイムアウトを指定
    )
    logging.info(f"シリアルポート {SERIAL_PORT} を開きました")  # 開いたことをログに記録
    return ser                                # シリアルオブジェクトを返す

def connect_tcp():
    """みらいサーバーへTCP接続する関数。失敗時はNoneを返す"""
    try:
        s = socket.create_connection((SERVER_HOST, SERVER_PORT), timeout=SOCKET_TIMEOUT)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)  # 無通信時の回線断を検知する
        GPIO.output("USR1", GPIO.HIGH)          # TCP接続中を示すLEDを点灯
        logging.info(f"TCP接続成功: {SERVER_HOST}:{SERVER_PORT}")
        return s
    except OSError as e:
        logging.error(f"TCP接続失敗: {e}")
        return None

def close_tcp():
    """TCP接続を閉じる関数"""
    global sock
    GPIO.output("USR1", GPIO.LOW)               # TCP切断を示すためLEDを消灯
    if sock is not None:
        sock.close()
        sock = None

def parse_raw_line(line):
    """
    IM920sからの1行データを解析し、必要な情報を辞書にまとめる関数
    フォーマット例: "00,0002,E4:3C,3B,3D,3C,41,..."
    """
    try:
        header_part, payload_part = line.split(":", 1)  # ":"でヘッダ部とデータ部を分割
        fields = header_part.split(",")                 # ヘッダ部を","で分割
        if len(fields) != 3:                             # フィールド数が3でなければ不正データ
            return None                                   # 不正データはNoneを返す

        return {                                            # 解析結果を辞書にまとめて返す
            "node_id": fields[1],                           # 送信元ノード番号
            "rssi_hex": fields[2],                          # RSSI(16進数のまま)
            "payload_hex": payload_part.strip(),            # センサデータ(16進数のまま、変換しない)
        }
    except ValueError:                                       # 分割に失敗した場合(不正な行)
        return None                                          # 解析失敗としてNoneを返す

def send_to_server(records):
    """確立済みTCP接続でJSON(改行区切り)を送信する関数"""
    payload = {
        "gateway_id": GATEWAY_ID,
        "sensor_data": records,
        "timestamp": time.time(),
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"

    try:
        sock.sendall(body.encode("utf-8"))      # 全バイト送信できるまで送る
        logging.info(f"TCP送信成功: {len(records)}件")
        return True
    except OSError as e:
        logging.error(f"TCP送信失敗: {e}")
        return False

def flush_buffer():
    """バッファのデータをTCP送信する関数。失敗時はバッファを保持し、次回再送する"""
    global sock, last_flush_time, last_connect_try
    last_flush_time = time.time()
    if not data_buffer:
        return

    if sock is None:
        if time.time() - last_connect_try < RECONNECT_INTERVAL:
            return                              # 再接続の間隔が空くまで待つ
        last_connect_try = time.time()
        sock = connect_tcp()

    if sock is not None and send_to_server(data_buffer):
        data_buffer.clear()
        return

    close_tcp()                                 # 送信失敗時は接続を破棄して再接続へ
    del data_buffer[:-BUFFER_LIMIT]             # 古いデータから破棄して件数を制限

def read_sensor_data(ser, send_queue):
    """IM920sから受信した1件ずつのデータをキューへ入れるproducer"""
    while True:
        if ser.in_waiting > 0:
            raw_line = ser.readline().decode("utf-8", errors="ignore").strip()
            if raw_line == "":
                continue

            parsed_data = parse_raw_line(raw_line)
            if parsed_data is None:
                logging.warning(f"不正なデータ行をスキップ: {raw_line}")
                continue

            if parsed_data["node_id"] not in EXPECTED_NODE_IDS:
                logging.warning(f"想定外のnode_idをスキップ: {parsed_data['node_id']}")
                continue

            parsed_data["timestamp"] = time.time()
            send_queue.put(parsed_data)
        else:
            time.sleep(0.05)

def send_sensor_batches(send_queue):
    """キューからデータを取り出してTCP送信するconsumer"""
    while True:
        try:
            data_buffer.append(send_queue.get(timeout=0.5))
        except queue.Empty:
            if data_buffer and (time.time() - last_flush_time) >= BUFFER_FLUSH_INTERVAL:
                flush_buffer()
            continue

        if send_queue.qsize() > 50:
            logging.warning(f"キュー滞留: {send_queue.qsize()}件 送信が追いついていません")

        if len(data_buffer) >= BUFFER_MAX_SIZE:
            flush_buffer()

def main():
    """メイン処理：起動後、IM920sからデータを受信してサーバーに送信し続ける"""
    setup_logger()                                            # ログ設定を初期化
    GPIO.setup("USR0", GPIO.OUT)                              # USR0: 動作中を示すLED
    GPIO.setup("USR1", GPIO.OUT)                              # USR1: TCP接続中を示すLED
    logging.info("プログラムを起動しました。データ収集を開始します")

    ser_im920 = open_serial()
    send_queue = queue.Queue()

    producer = threading.Thread(
        target=read_sensor_data,
        args=(ser_im920, send_queue),
        daemon=True,
    )
    consumer = threading.Thread(
        target=send_sensor_batches,
        args=(send_queue,),
        daemon=True,
    )
    producer.start()
    consumer.start()

    GPIO.output("USR0", GPIO.HIGH)

    try:
        while producer.is_alive() and consumer.is_alive():
            time.sleep(1)
        # スレッドが異常終了した場合は終了し、systemdのRestartで再起動させる
        logging.error("受信または送信スレッドが終了したため、プログラムを終了します")
        sys.exit(1)
    finally:
        close_tcp()
        ser_im920.close()
        GPIO.output("USR0", GPIO.LOW)
        logging.info("ソケットとシリアルポートを閉じました")

if __name__ == "__main__":                                          # このファイルが直接実行された場合
    try:
        main()                                                      # メイン処理を開始
    except KeyboardInterrupt:                                        # Ctrl+Cで中断された場合
        logging.info("Ctrl+Cによりプログラムを終了します")             # 終了ログ
        sys.exit(0)                                                  # 正常終了
