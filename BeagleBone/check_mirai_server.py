#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_connection.py
4GIM経由でみらいサーバーへの通信疎通を確認するプログラム
"""

import serial    # シリアル通信用
import time      # 待機用

# ===== 設定 =====
SERIAL_4GIM = "/dev/ttyS1"   # 4GIMのUARTポート
BAUD_4GIM   = 115200          # 4GIMのボーレート
SERVER_HOST = "153.125.138.233"  # 送信先ホスト
SERVER_PORT = 9000               # 送信先TCPポート
# ================

def check():
    """疎通確認を行う関数"""
    body = '{"gateway_id":"GW01","node_id":"CHECK","payload_hex":"TEST"}'
    data = body.encode("utf-8")

    connect_command = f'$TC {SERVER_HOST} {SERVER_PORT}\r\n'
    send_command = f'$TW {len(data)}\r\n'

    print(f"[接続コマンド]\n{connect_command.strip()}\n")
    print(f"[送信コマンド]\n{send_command.strip()}<JSON>\n")

    try:
        ser = serial.Serial(port=SERIAL_4GIM, baudrate=BAUD_4GIM, timeout=35)
        print("4GIMシリアルポートを開きました")

        ser.write(connect_command.encode("ascii"))
        print("TCP接続コマンド送信完了。応答待ち中...")
        response = ser.read_until(b"\n").decode("ascii", errors="ignore").strip()
        print(f"\n[4GIM応答]\n{response}\n")

        if "$TC=OK" not in response and "OK" not in response:
            print("❌ TCP接続に失敗しました")
            ser.close()
            return

        ser.write(send_command.encode("ascii") + data + b"\r\n")  # コマンド送信
        print("コマンド送信完了。応答待ち中（最大35秒）...")

        response = ser.read_until(b"\n").decode("ascii", errors="ignore").strip()
        ser.close()

        print(f"\n[4GIM応答]\n{response}\n")

        if "$TW=OK" in response or "OK" in response:
            print("✅ 通信成功：みらいサーバーへのTCP送信が正常に完了しました")
        elif "$TW=NG" in response:
            print(f"❌ 失敗：{response}")
        else:
            print(f"⚠️  不明な応答：{response}")

    except serial.SerialException as e:
        print(f"❌ シリアルポートエラー: {e}")

if __name__ == "__main__":
    check()