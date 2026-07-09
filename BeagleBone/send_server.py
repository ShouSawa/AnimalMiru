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
import Adafruit_BBIO.GPIO as GPIO  # BeagleBoneのGPIO制御用ライブラリ
import sys             # プログラム終了処理用ライブラリ
import logging         # ログ出力用ライブラリ

# ===================== 設定項目（環境に合わせて変更） =====================
SERIAL_PORT = "/dev/ttyO4"          # IM920sが接続されているBeagleBoneのUARTポート
SERIAL_BAUDRATE = 19200             # IM920sの通信速度(bps)
SERIAL_TIMEOUT = 1                  # シリアル読み取りのタイムアウト(秒)

SWITCH_PIN = "P9_12"                # 開始/終了を制御するスイッチが接続されたGPIOピン番号
SWITCH_POLL_INTERVAL = 0.2          # スイッチ状態を確認する間隔(秒)

SERIAL_4GIM = "/dev/ttyS1"         # 4GIMが接続されているBeagleBoneのUARTポート
BAUD_4GIM = 115200                  # 4GIMのボーレート
SERVER_URL = "http://153.125.138.233:8080/api/sensor"  # 4GIM経由で送るみらいサーバーのURL
GATEWAY_ID = "GW01"                 # このゲートウェイ自身を識別するID(要変更)

LOG_FILE = "/var/log/im920_gateway.log"  # 動作ログの保存先ファイル
# ==========================================================================


def setup_logger():
    """ログ出力の設定を行う関数"""
    logging.basicConfig(                     # ログの基本設定
        filename=LOG_FILE,                   # 出力先ファイルを指定
        level=logging.INFO,                  # INFOレベル以上を記録
        format="%(asctime)s [%(levelname)s] %(message)s"  # 日時付きフォーマット
    )
    logging.getLogger().addHandler(logging.StreamHandler())  # 画面にも同時出力


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


def send_to_server(parsed_data, raw_line):
    """解析済みデータを4GIMの$WPコマンド経由でみらいサーバーへ送信する関数"""
    payload = {
        "gateway_id": GATEWAY_ID,
        "node_id": parsed_data["node_id"],
        "rssi_hex": parsed_data["rssi_hex"],
        "payload_hex": parsed_data["payload_hex"],
        "raw_line": raw_line.replace('"', "'"),
        "timestamp": time.time(),
    }

    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    command = f'$WP {SERVER_URL} "{body}" "Content-Type: application/json"\r\n'

    try:
        with serial.Serial(
            port=SERIAL_4GIM,
            baudrate=BAUD_4GIM,
            timeout=15,
        ) as ser:
            ser.write(command.encode("ascii"))
            time.sleep(0.1)
            response = ser.read(256).decode("ascii", errors="ignore")

        if "$WP=OK" in response:
            logging.info(f"4GIM送信成功: node={parsed_data['node_id']}")
        else:
            logging.error(f"4GIM送信失敗: {response}")
    except serial.SerialException as e:
        logging.error(f"4GIMシリアル送信エラー: {e}")


def main():
    """メイン処理：スイッチがONの間、IM920sからデータを受信してサーバーに送信し続ける"""
    setup_logger()                                            # ログ設定を初期化
    setup_gpio()                                              # GPIO(スイッチ)を初期化

    logging.info("プログラムを起動しました。スイッチONを待機中...")  # 起動ログ

    while True:                                                # スイッチの状態を監視し続けるループ
        if is_switch_on():                                     # スイッチがONになったら
            logging.info("スイッチON検出：データ収集を開始します")  # 開始ログ
            run_gateway_loop()                                  # メインのゲートウェイ処理を開始
            logging.info("スイッチOFF検出：データ収集を終了します")  # 終了ログ
        time.sleep(SWITCH_POLL_INTERVAL)                        # 一定間隔でスイッチを確認


def run_gateway_loop():
    """スイッチがONの間、シリアル受信とサーバー送信を繰り返す関数"""
    ser = open_serial()                                         # シリアルポートを開く

    try:
        while is_switch_on():                                   # スイッチがONの間繰り返す
            if ser.in_waiting > 0:                               # 受信バッファにデータがあれば
                raw_bytes = ser.readline()                       # 1行分のデータを読み取る
                raw_line = raw_bytes.decode(                     # バイト列を文字列にデコード
                    "utf-8", errors="ignore"                     # デコードできない文字は無視
                ).strip()                                        # 前後の改行・空白を除去

                if raw_line == "":                                # 空行ならスキップ
                    continue                                      # 次のループへ

                parsed_data = parse_raw_line(raw_line)             # 受信データを解析
                if parsed_data is None:                            # 解析に失敗した場合
                    logging.warning(f"不正なデータ行をスキップ: {raw_line}")  # 警告ログ
                    continue                                        # 次のループへ

                send_to_server(parsed_data, raw_line)               # サーバーへ送信
            else:
                time.sleep(0.05)                                    # データが無ければ少し待機(CPU負荷軽減)
    finally:
        ser.close()                                                 # 必ずシリアルポートを閉じる
        logging.info("シリアルポートを閉じました")                    # クローズログ


if __name__ == "__main__":                                          # このファイルが直接実行された場合
    try:
        main()                                                      # メイン処理を開始
    except KeyboardInterrupt:                                        # Ctrl+Cで中断された場合
        logging.info("Ctrl+Cによりプログラムを終了します")             # 終了ログ
        sys.exit(0)                                                  # 正常終了