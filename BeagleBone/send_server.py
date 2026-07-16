#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
send_server.py
IM920sで受信した赤外線焦電センサデータを、そのままみらいサーバーへ
4Gim経由で送信するゲートウェイプログラム（BeagleBone上で動作）

スイッチON  : プログラム開始（センサデータの収集・送信を開始）
スイッチOFF : プログラム終了（安全にシリアルポートを閉じて終了）
"""

import serial          # シリアル通信用ライブラリ
import json            # 4GIMへ渡すJSON文字列の生成用
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

SWITCH_PIN = "P9_12"                # 開始/終了を制御するスイッチが接続されたGPIOピン番号
SWITCH_POLL_INTERVAL = 0.2          # スイッチ状態を確認する間隔(秒)

SERIAL_4GIM = "/dev/ttyS1"         # 4GIMが接続されているBeagleBoneのUARTポート
BAUD_4GIM = 115200                  # 4GIMのボーレート
SERVER_HOST = "153.125.138.233"    # 4GIMが接続するサーバーのホスト
SERVER_PORT = 9000                  # TCPポート
GATEWAY_ID = "GW01"                 # このゲートウェイ自身を識別するID(要変更)

LOG_FILE = f"/home/debian/log/im920_gateway_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
EXPECTED_NODE_IDS = ("0002", "0003", "0004", "0005")  # 1回の送信でまとめる4ノード
BUFFER_FLUSH_INTERVAL = 2          # 2秒ごとにまとめて送信する
BUFFER_MAX_SIZE = 5               # または約1秒分たまる件数で送信する
# ==========================================================================

data_buffer = []
last_flush_time = time.time()
ser_4gim = None

def reset_4gim():
    """4GIMをリセットして通信を安定させる関数"""
    logging.info("4GIMをリセット中...")
    try:
        with serial.Serial(SERIAL_4GIM, BAUD_4GIM, timeout=5) as ser:
            ser.write(b'$YE\r\n')        # リセットコマンド送信
        time.sleep(20)                   # 再起動完了まで20秒待機
        logging.info("4GIMリセット完了")
    except serial.SerialException as e:
        logging.error(f"4GIMリセットエラー: {e}")

def setup_logger():
    """ログ出力の設定を行う関数"""
    logging.basicConfig(                     # ログの基本設定
        filename=LOG_FILE,                   # 出力先ファイルを指定
        level=logging.INFO,                  # INFOレベル以上を記録
        format="%(asctime)s [%(levelname)s] %(message)s"  # 日時付きフォーマット
    )
    logging.getLogger().addHandler(logging.StreamHandler())  # 画面にも同時出力

def connect_tcp():
    """4GIMとみらいサーバー間のTCP接続を確立する関数（起動時1回だけ呼ぶ）"""
    ser = serial.Serial(port=SERIAL_4GIM, baudrate=BAUD_4GIM, timeout=15)
    
    # 念のため既存接続を切断してからつなぎ直す
    ser.reset_input_buffer()
    ser.write(b'$TD\r\n')          # 既存接続を切断
    time.sleep(2)
    ser.read(256)                   # 応答を読み捨て

    ser.reset_input_buffer()
    cmd = f'$TC {SERVER_HOST} {SERVER_PORT}\r\n'
    ser.write(cmd.encode("ascii"))  # TCP接続コマンド送信
    time.sleep(5)                   # 接続確立待ち（余裕を持って5秒）
    response = ser.read(256).decode("ascii", errors="ignore")
    
    if "$TC=OK" in response:
        logging.info("4GIM TCP接続成功")
        return ser                  # 接続済みのシリアルオブジェクトを返す
    else:
        logging.error(f"4GIM TCP接続失敗: {response}")
        ser.close()
        return None                 # 接続失敗

def setup_gpio():
    """スイッチ用GPIOピンの初期設定を行う関数"""
    GPIO.setup(SWITCH_PIN, GPIO.IN)           # スイッチピンを入力モードに設定

def is_switch_on():
    """スイッチがONかどうかを判定する関数（配線に応じてHIGH/LOWを調整）"""
    return GPIO.input(SWITCH_PIN) == GPIO.HIGH  # ピンがHIGHならON、LOWならOFFとみなす

def open_serial():
    """IM920sとのシリアルポートを開く関数"""
    ser = serial.Serial(                      # シリアルポートをオープン
        port=SERIAL_PORT,                     # ポート名を指定
        baudrate=SERIAL_BAUDRATE,             # ボーレートを指定
        timeout=SERIAL_TIMEOUT                # タイムアウトを指定
    )
    logging.info(f"シリアルポート {SERIAL_PORT} を開きました")  # 開いたことをログに記録
    return ser                                # シリアルオブジェクトを返す

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

        node_id = fields[1]                               # 送信元ノード番号を取得
        rssi_hex = fields[2]                               # RSSI(16進数)を取得
        payload_hex = payload_part.strip()                 # センサデータ部分(16進数文字列)を取得

        return {                                            # 解析結果を辞書にまとめて返す
            "node_id": node_id,                             # 送信元ノード番号
            "rssi_hex": rssi_hex,                           # RSSI(16進数のまま)
            "payload_hex": payload_hex,                     # センサデータ(16進数のまま、変換しない)
        }
    except ValueError:                                       # 分割に失敗した場合(不正な行)
        return None                                          # 解析失敗としてNoneを返す

def dollar_encode(s):
    """4GIMの$エンコードを行う関数"""
    s = s.replace("$", "$$")   # $を先に変換（順番重要）
    s = s.replace('"', '$"')   # ダブルクォートを変換
    s = s.replace("\n", "$n")  # 改行を変換
    s = s.replace("\r", "$r")  # CRを変換
    return s


def build_batch_payload(records):
    """まとめたセンサデータを1つの送信用JSONにまとめる関数"""
    return {
        "gateway_id": GATEWAY_ID,
        "sensor_data": records,
        "timestamp": time.time(),
    }

def send_to_server(records, ser_4gim):
    """確立済みTCP接続で$TWコマンドを使ってデータを送信する関数"""
    payload = {
        "gateway_id": GATEWAY_ID,
        "sensor_data": records,
        "timestamp": time.time(),
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    body_bytes = body.encode("utf-8")

    if len(body_bytes) > 1024:      # サイズチェック
        logging.error(f"データが大きすぎます: {len(body_bytes)}バイト")
        return False

    # $エンコードしてダブルクォートで囲む方式
    encoded = dollar_encode(body)
    cmd = f'$TW "{encoded}"\r\n'

    try:
        ser_4gim.reset_input_buffer()
        ser_4gim.write(cmd.encode("ascii"))     # $TWコマンド送信
        response = ser_4gim.read_until(b"\n").decode("ascii", errors="ignore").strip()

        if "$TW=OK" in response:
            logging.info(f"TCP送信成功: {len(records)}件")
            return True
        else:
            logging.error(f"TCP送信失敗: {response}")
            return False
    except serial.SerialException as e:
        logging.error(f"シリアルエラー: {e}")
        return False

def flush_buffer(ser_4gim):
    """バッファのデータをTCP送信する関数"""
    global last_flush_time
    if not data_buffer:
        return
    batch_records = data_buffer.copy()
    data_buffer.clear()
    last_flush_time = time.time()
    logging.info(f"バッファ送信: records={len(batch_records)}")
    send_to_server(batch_records, ser_4gim)


def read_sensor_data(ser, send_queue):
    """IM920sから受信した1件ずつのデータをキューへ入れるproducer"""
    while is_switch_on():
        if ser.in_waiting > 0:
            raw_bytes = ser.readline()
            raw_line = raw_bytes.decode(
                "utf-8", errors="ignore"
            ).strip()

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


def send_sensor_batches(send_queue, ser_4gim):
    """キューからデータを取り出してTCP送信するconsumer"""
    global last_flush_time
    while is_switch_on() or not send_queue.empty():
        try:
            parsed_data = send_queue.get(timeout=0.5)
        except queue.Empty:
            if data_buffer and (time.time() - last_flush_time) >= BUFFER_FLUSH_INTERVAL:
                flush_buffer(ser_4gim)
            continue

        data_buffer.append({
            "node_id": parsed_data["node_id"],
            "rssi_hex": parsed_data["rssi_hex"],
            "payload_hex": parsed_data["payload_hex"],
            "timestamp": parsed_data["timestamp"],
        })

        if send_queue.qsize() > 50:
            logging.warning(f"キュー滞留: {send_queue.qsize()}件 送信が追いついていません")

        if len(data_buffer) >= BUFFER_MAX_SIZE:
            flush_buffer(ser_4gim)
            send_queue.task_done()
            continue

        send_queue.task_done()

    flush_buffer(ser_4gim)

def main():
    """メイン処理：スイッチがONの間、IM920sからデータを受信してサーバーに送信し続ける"""
    setup_logger()                                            # ログ設定を初期化
    setup_gpio()                                              # GPIO(スイッチ)を初期化
    GPIO.setup("USR0", GPIO.OUT)                              # GPIO,USR0をLED出力モードに設定
    GPIO.setup("USR1", GPIO.OUT)
    reset_4gim()                                              # 4GIMをリセットして通信を安定させる
    logging.info("プログラムを起動しました。スイッチONを待機中...")  # 起動ログ
    GPIO.output("USR1", GPIO.HIGH)

    while True:                                                # スイッチの状態を監視し続けるループ
        if is_switch_on():                                     # スイッチがONになったら
            GPIO.output("USR1", GPIO.LOW)
            logging.info("スイッチON検出：データ収集を開始します")  # 開始ログ
            run_gateway_loop()                                  # メインのゲートウェイ処理を開始
            GPIO.output("USR1", GPIO.HIGH)
            logging.info("スイッチOFF検出：データ収集を終了します")  # 終了ログ
        time.sleep(SWITCH_POLL_INTERVAL)                        # 一定間隔でスイッチを確認

def run_gateway_loop():
    """TCP接続を1回確立し、その接続を使い続けてデータ送信する"""
    global last_flush_time
    data_buffer.clear()
    last_flush_time = time.time()

    # TCP接続を起動時に1回だけ確立
    ser_4gim = connect_tcp()
    if ser_4gim is None:
        logging.error("TCP接続失敗のため終了します")
        return

    ser_im920 = open_serial()
    send_queue = queue.Queue()

    producer = threading.Thread(
        target=read_sensor_data,
        args=(ser_im920, send_queue),
        daemon=True,
    )
    consumer = threading.Thread(
        target=send_sensor_batches,
        args=(send_queue, ser_4gim),  # ser_4gimを渡す
        daemon=True,
    )
    producer.start()
    consumer.start()

    try:
        while is_switch_on():
            GPIO.output("USR0", GPIO.HIGH)
            time.sleep(0.05)
        producer.join()
        consumer.join()
    finally:
        ser_4gim.write(b'$TD\r\n')   # TCP切断
        time.sleep(1)
        ser_4gim.close()
        ser_im920.close()
        GPIO.output("USR0", GPIO.LOW)
        logging.info("シリアルポートを閉じました")

if __name__ == "__main__":                                          # このファイルが直接実行された場合
    try:
        main()                                                      # メイン処理を開始
    except KeyboardInterrupt:                                        # Ctrl+Cで中断された場合
        logging.info("Ctrl+Cによりプログラムを終了します")             # 終了ログ
        sys.exit(0)                                                  # 正常終了