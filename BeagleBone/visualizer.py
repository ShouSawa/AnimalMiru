#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BeagleBone用 PIRセンサデータ リアルタイム可視化
matplotlib を使用してリアルタイムグラフ表示
"""

import serial
import time
import re
from datetime import datetime
from collections import deque
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import numpy as np

class RealtimePIRVisualizer:
    def __init__(self, port='/dev/ttyO1', baudrate=19200, window_size=200):
        """
        Parameters:
        -----------
        port : str
            シリアルポート
        baudrate : int
            ボーレート
        window_size : int
            表示するサンプル数
        """
        self.port = port
        self.baudrate = baudrate
        self.window_size = window_size
        
        # データバッファ
        self.times = deque(maxlen=window_size)
        self.a1_data = deque(maxlen=window_size)
        self.a2_data = deque(maxlen=window_size)
        self.a3_data = deque(maxlen=window_size)
        
        self.start_time = time.time()
        self.ser = None
        
        # グラフ初期化
        self.fig, self.axes = plt.subplots(3, 1, figsize=(12, 9))
        self.fig.suptitle('PIRセンサ リアルタイムモニタ', fontsize=16, fontweight='bold')
        
        self.lines = []
        sensor_names = ['A1', 'A2', 'A3']
        colors = ['#2196F3', '#FF9800', '#4CAF50']
        
        for idx, (ax, name, color) in enumerate(zip(self.axes, sensor_names, colors)):
            line, = ax.plot([], [], color=color, linewidth=2, label=name)
            self.lines.append(line)
            
            ax.set_xlim(0, window_size / 10)  # 約10サンプル/秒と仮定
            ax.set_ylim(0, 255)
            ax.set_xlabel('時間 (秒)', fontsize=10)
            ax.set_ylabel('センサ値 (8bit)', fontsize=10)
            ax.set_title(f'センサ {name}', fontsize=12, fontweight='bold')
            ax.grid(True, alpha=0.3)
            ax.legend(loc='upper right')
        
        plt.tight_layout()
    
    def connect(self):
        """シリアルポート接続"""
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=0.1
            )
            print(f"✓ {self.port} に接続しました")
            time.sleep(2)
            return True
        except Exception as e:
            print(f"✗ 接続エラー: {e}")
            return False
    
    def parse_data(self, line):
        """データ解析（beaglebone_receiver.pyと同じ）"""
        pattern = r'00,0004,\d+:([0-9A-Fa-f]+)'
        match = re.search(pattern, line)
        
        if not match:
            return None
        
        hex_data = match.group(1)
        values = []
        
        for i in range(0, len(hex_data), 2):
            if i + 1 < len(hex_data):
                values.append(int(hex_data[i:i+2], 16))
        
        samples = []
        for i in range(0, len(values), 3):
            if i + 2 < len(values):
                samples.append((values[i], values[i+1], values[i+2]))
        
        return samples
    
    def update_plot(self, frame):
        """アニメーションフレーム更新"""
        if self.ser and self.ser.in_waiting > 0:
            line = self.ser.readline().decode('utf-8', errors='ignore').strip()
            
            if line:
                samples = self.parse_data(line)
                
                if samples:
                    current_time = time.time() - self.start_time
                    
                    for a1, a2, a3 in samples:
                        self.times.append(current_time)
                        self.a1_data.append(a1)
                        self.a2_data.append(a2)
                        self.a3_data.append(a3)
        
        # グラフ更新
        if len(self.times) > 0:
            times_array = np.array(self.times)
            
            data_arrays = [
                np.array(self.a1_data),
                np.array(self.a2_data),
                np.array(self.a3_data)
            ]
            
            for idx, (line, data, ax) in enumerate(zip(self.lines, data_arrays, self.axes)):
                line.set_data(times_array, data)
                
                # X軸の範囲を自動調整
                if len(times_array) > 0:
                    ax.set_xlim(max(0, times_array[-1] - 20), times_array[-1] + 1)
        
        return self.lines
    
    def run(self):
        """実行"""
        if not self.connect():
            return
        
        print("\n=== リアルタイム可視化開始 ===")
        print("ウィンドウを閉じると終了します\n")
        
        # アニメーション開始
        ani = animation.FuncAnimation(
            self.fig,
            self.update_plot,
            interval=50,  # 50ms更新
            blit=True
        )
        
        try:
            plt.show()
        except KeyboardInterrupt:
            print("\n終了します")
        finally:
            if self.ser and self.ser.is_open:
                self.ser.close()


if __name__ == '__main__':
    visualizer = RealtimePIRVisualizer(
        port='/dev/ttyO1',
        baudrate=19200,
        window_size=200
    )
    visualizer.run()