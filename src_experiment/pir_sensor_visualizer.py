#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PIRセンサーデータ可視化ツール - クイック可視化版
12個のPIRセンサーのデータをCSVファイルから読み込み、指定されたレイアウトで可視化
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import os
from datetime import datetime
from matplotlib.patches import Rectangle
from PIL import Image

# フォント設定
plt.rcParams['font.family'] = 'DejaVu Sans'

class PIRSensorVisualizer:
  """PIRセンサーデータ可視化クラス"""
  
  def __init__(self):
    # 提供された配置情報に基づいたセンサーレイアウト
    # 12行12列のグリッドで細かな位置調整、各グラフは2x2セルで大きく表示
    self.sensor_positions = {
      1:  (8, 7),       # 上から5段目右寄り
      4:  (4, 7),       # 下から7段目右寄り
      7:  (4, 3),      # 下段左
      10: (8, 3),       # 上から5段目左寄り
      3:  (9, 10),      # 上段右
      5:  (3, 10),      # 下から5段目右端
      9:  (3, 0),       # 下から5段目左端
      11: (9, 0),      # 上段左
      2:  (11, 8),      # 上から3段目右端
      6:  (1, 8),       # 下から7段目左寄り
      8:  (1, 2),      # 下段右
      12: (11, 2),       # 上から3段目左端
    }
  
  def load_and_process_data(self, csv_file_path):
    """
    CSVファイルを読み込み、タイムスタンプを処理する
    """
    try:
      df = pd.read_csv(csv_file_path)
      df['datetime'] = pd.to_datetime(df['date'] + ' ' + df['timestamp'])
      return df
    except Exception as e:
      print(f"エラー: ファイルの読み込みに失敗しました - {e}")
      return None
  
  def create_sensor_layout_plot(self, df, title="PIRセンサーデータ可視化"):
    """
    提供された配置情報に従ってセンサーデータをプロットする
    背景にデータビジュアル画像を配置
    """
    # 背景画像の読み込み
    figure_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "figure", "データビジュアル.png")
    try:
      background_img = Image.open(figure_path)
    except Exception as e:
      print(f"Warning: 背景画像の読み込みに失敗しました - {e}")
      background_img = None
    
    # 出力画像の大きさ
    fig = plt.figure(figsize=(24, 24))
    fig.suptitle(title, fontsize=20, fontweight='bold')
    
    # 背景画像がある場合は全体の背景として設定
    if background_img is not None:
      # メインの軸を作成（背景用）
      main_ax = fig.add_subplot(111)
      main_ax.imshow(background_img, extent=[0, 12, 0, 12], aspect='auto', alpha=0.3)
      main_ax.set_xlim(0, 12)
      main_ax.set_ylim(0, 12)
      main_ax.axis('off')
    
    # 12x12のサブプロットグリッドを作成（各グラフは2x2セルで表示）
    for sensor_num, (row, col) in self.sensor_positions.items():
      # 行を反転（matplotlibは下から上へ、我々の定義は上から下へ）
      adjusted_row = 11 - row
      ax = plt.subplot2grid((12, 12), (adjusted_row, col), rowspan=2, colspan=2)
      
      # 電圧データの取得
      voltage_col = f'voltage_no{sensor_num}'
      time_data = df['datetime']
      voltage_data = df[voltage_col]
      
      # プロット
      ax.plot(time_data, voltage_data, linewidth=1.5, color=f'C{sensor_num-1}', alpha=0.9)
      
      # タイトルのみ設定（軸ラベルは削除）
      ax.set_title(f'Sensor {sensor_num}', fontsize=12, fontweight='bold', bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
      ax.grid(True, alpha=0.3)
      
      # 背景を半透明の白に設定
      ax.set_facecolor((1, 1, 1, 0.8))
      
      # X軸とY軸のラベルは全て削除（軸の目盛りは残す）
      if adjusted_row > 1:
        ax.set_xticklabels([])
    
    plt.tight_layout()
    plt.subplots_adjust(top=0.93, bottom=0.08)
    return fig
  

  
  def quick_visualization(self, csv_file_path=None):
    """
    クイック可視化実行
    """
    filename = "change-0.1-test-in-lab-horizontal-walk_20250919_174223.csv"
    if csv_file_path is None:
      csv_file_path = os.path.join(r"c:\Users\shota\Local_Documents\AnimalMiru\experiment_data\csv_data", filename)
    
    print("=== PIR Sensor Quick Visualization ===")
    df = self.load_and_process_data(csv_file_path)
    
    if df is None:
      return
    
    print(f"Data points: {len(df)}")
    print(f"Measurement period: {df['datetime'].min()} to {df['datetime'].max()}")
    
    # 物理的レイアウトでプロット
    layout_fig = self.create_sensor_layout_plot(df, "PIR Sensor Data - Physical Layout")
    layout_name = "physical"
    
    # 画像を表示
    plt.show()
    
    # 表示後に保存確認
    save_choice = input("\nDo you want to save the graph as PNG file? (y/n): ").strip().lower()
    
    if save_choice == 'y' or save_choice == 'yes':
      # ファイル名の入力
      filename = input("Enter filename (without extension, press Enter for default): ").strip()
      if not filename:
        filename = f"pir_sensor_visualization_{layout_name}"
      
      # 現在の日時を取得してフォーマット
      current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
      
      # ファイル名に日時を追記
      filename_with_time = f"{filename}_{current_time}.png"
      
      # experiment_data/figureフォルダのパスを設定
      project_root = os.path.dirname(os.path.dirname(csv_file_path))  # experiment_dataフォルダ
      figure_dir = os.path.join(project_root, "figure_result")
      
      # figureフォルダが存在しない場合は作成
      os.makedirs(figure_dir, exist_ok=True)
      
      output_path = os.path.join(figure_dir, filename_with_time)
      layout_fig.savefig(output_path, dpi=300, bbox_inches='tight')
      print(f"Graph saved: {output_path}")
    else:
      print("Graph not saved.")


def main():
  """
  メイン関数 - クイック可視化のみ
  """
  visualizer = PIRSensorVisualizer()
  
  print("=" * 50)
  print("PIR Sensor Data Quick Visualization")
  print("=" * 50)
  
  # デフォルトファイルでクイック可視化を実行
  visualizer.quick_visualization()


if __name__ == "__main__":
  main()