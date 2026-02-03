#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BeagleBone用 IM920s PIRセンサデータ受信プログラム
シリアルポート（UART）からデータを受信し、CSVに保存
"""

import serial
import time
import re
from datetime import datetime
import csv
import os
from collections import deque

class IM920sReceiver:
    def __init__(self, port='/dev/ttyO1', baudrate=19200):
        """
        Parameters:
        -----------
        port : str
            シリアルポート（BeagleBoneの場合は/dev/ttyO1など）
        baudrate : int
            ボーレート（IM920sは19200）
        """
        self.port = port
        self.baudrate = baudrate
        self.ser = None
        
        # リングバッファ（最新1000サンプルを保持）
        self.buffer_size = 1000
        self.data_buffer = {
            'A1': deque(maxlen=self.buffer_size),
            'A2': deque(maxlen=self.buffer_size),
            'A3': deque(maxlen=self.buffer_size),
            'timestamps': deque(maxlen=self.buffer_size)
        }
        
        # CSV保存用
        self.csv_file = None
        self.csv_writer = None
        
    def connect(self):
        """シリアルポートに接続"""
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1
            )
            print(f"✓ {self.port} に接続しました（{self.baudrate}bps）")
            time.sleep(2)  # 接続安定化待ち
            return True
        except Exception as e:
            print(f"✗ シリアルポート接続エラー: {e}")
            return False
    
    def parse_received_data(self, line):
        """
        受信データを解析
        例: "00,0004,01:12,14,13,22,14,13,22,11..."
        フォーマット: ノード番号,送信元ノード番号,RSSI:データ(2桁16進数)
        
        Returns:
        --------
        list of tuples: [(A1, A2, A3), (A1, A2, A3), ...]
        """
        pattern = r'00,0004,\d+:([0-9A-Fa-f]+)'
        match = re.search(pattern, line)
        
        if not match:
            return None
        
        hex_data = match.group(1)
        
        # 2桁ごとに分割して10進数に変換
        values = []
        for i in range(0, len(hex_data), 2):
            if i + 1 < len(hex_data):
                hex_byte = hex_data[i:i+2]
                decimal_value = int(hex_byte, 16)
                values.append(decimal_value)
        
        # 3つずつグループ化（A1, A2, A3）
        samples = []
        for i in range(0, len(values), 3):
            if i + 2 < len(values):
                samples.append((values[i], values[i+1], values[i+2]))
        
        return samples
    
    def start_csv_recording(self, filename=None):
        """CSV記録開始"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            os.makedirs('/home/debian/pir_data', exist_ok=True)
            filename = f'/home/debian/pir_data/pir_data_{timestamp}.csv'
        
        self.csv_file = open(filename, 'w', newline='')
        self.csv_writer = csv.writer(self.csv_file)
        self.csv_writer.writerow(['timestamp', 'A1', 'A2', 'A3'])
        print(f"✓ CSV記録開始: {filename}")
        return filename
    
    def run(self, save_csv=True):
        """メインループ"""
        if not self.connect():
            return
        
        if save_csv:
            self.start_csv_recording()
        
        print("\n=== データ受信開始 ===")
        print("終了するには Ctrl+C を押してください\n")
        
        try:
            while True:
                if self.ser.in_waiting > 0:
                    line = self.ser.readline().decode('utf-8', errors='ignore').strip()
                    
                    if line:
                        print(f"受信: {line}")
                        samples = self.parse_received_data(line)
                        
                        if samples:
                            current_time = time.time()
                            
                            for a1, a2, a3 in samples:
                                # バッファに追加
                                self.data_buffer['A1'].append(a1)
                                self.data_buffer['A2'].append(a2)
                                self.data_buffer['A3'].append(a3)
                                self.data_buffer['timestamps'].append(current_time)
                                
                                # CSV保存
                                if self.csv_writer:
                                    timestamp_str = datetime.fromtimestamp(current_time).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                                    self.csv_writer.writerow([timestamp_str, a1, a2, a3])
                                
                                print(f"  → A1={a1:3d}, A2={a2:3d}, A3={a3:3d}")
                            
                            if self.csv_file:
                                self.csv_file.flush()
                
                time.sleep(0.01)
                
        except KeyboardInterrupt:
            print("\n\n=== 終了処理中 ===")
        finally:
            self.cleanup()
    
    def cleanup(self):
        """クリーンアップ"""
        if self.csv_file:
            self.csv_file.close()
            print("✓ CSVファイルを閉じました")
        
        if self.ser and self.ser.is_open:
            self.ser.close()
            print("✓ シリアルポートを閉じました")
        
        print("\n終了しました")
    
    def get_latest_data(self, num_samples=100):
        """最新データを取得（可視化用）"""
        return {
            'A1': list(self.data_buffer['A1'])[-num_samples:],
            'A2': list(self.data_buffer['A2'])[-num_samples:],
            'A3': list(self.data_buffer['A3'])[-num_samples:],
            'timestamps': list(self.data_buffer['timestamps'])[-num_samples:]
        }


if __name__ == '__main__':
    # BeagleBoneのUARTポートを指定（環境に応じて変更）
    # /dev/ttyO1, /dev/ttyO2, /dev/ttyUSB0 など
    receiver = IM920sReceiver(port='/dev/ttyO1', baudrate=19200)
    receiver.run(save_csv=True)