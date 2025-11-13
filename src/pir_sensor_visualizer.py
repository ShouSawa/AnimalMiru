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
from matplotlib.ticker import FuncFormatter, MaxNLocator
from PIL import Image

# フォント設定
plt.rcParams['font.family'] = 'DejaVu Sans'

class PIRSensorVisualizer:
  """PIRセンサーデータ可視化クラス"""
  
  def __init__(self):
    # 提供された配置情報に基づいたセンサーレイアウト
    # 24行24列のグリッドで細かな位置調整、各グラフは4x4セルで大きく表示
    self.sensor_positions = {
      1:  (16, 13),       # 上から5段目右寄り
      4:  (8, 13),       # 下から7段目右寄り
      7:  (8, 7),      # 下段左
      10: (16, 7),       # 上から5段目左寄り
      3:  (18, 19),      # 上段右
      5:  (6, 19),      # 下から5段目右端
      9:  (6, 1),       # 下から5段目左端
      11: (18, 1),      # 上段左
      2:  (22, 13),      # 上から3段目右端
      6:  (2, 13),       # 下から7段目左寄り
      8:  (2, 7),      # 下段右
      12: (22, 7),       # 上から3段目左端
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
  
  def create_sensor_layout_plot(self, df, title="PIRセンサーデータ可視化", csv_filename="", original_start_time=None):
    """
    提供された配置情報に従ってセンサーデータをプロットする
    背景にデータビジュアル画像を配置
    
    Parameters:
    -----------
    df : DataFrame
      表示するデータ
    title : str
      グラフタイトル
    csv_filename : str
      CSVファイル名
    original_start_time : Timestamp
      元データ全体の開始時刻（時間範囲抽出時に使用）
    """
    # 背景画像の読み込み
    figure_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "figure", "データビジュアルv2.png")
    try:
      background_img = Image.open(figure_path)
    except Exception as e:
      print(f"Warning: 背景画像の読み込みに失敗しました - {e}")
      background_img = None
    
    # 出力画像の大きさ
    fig = plt.figure(figsize=(24, 24))
    
    # タイトルとファイル名を表示
    main_title = title
    if csv_filename:
      main_title = f"{title}\n{csv_filename}"
    
    fig.suptitle(main_title, fontsize=20, fontweight='bold')
    
    # 背景画像がある場合は全体の背景として設定
    if background_img is not None:
      # メインの軸を作成（背景用）
      main_ax = fig.add_subplot(111)
      # アスペクト比の維持をここで行う
      main_ax.imshow(background_img, extent=[2, 22, 0, 22], aspect='auto', alpha=0.5)
      main_ax.set_xlim(0, 24)
      main_ax.set_ylim(0, 24)
      main_ax.axis('off')
    
    # 24x24のサブプロットグリッドを作成（各グラフは4x4セルで表示）
    # データ全体の時間範囲を計算（X軸の目盛り設定用）
    if original_start_time is not None:
      start_time_for_ticks = original_start_time
    else:
      start_time_for_ticks = df['datetime'].iloc[0]
    
    time_range_seconds = (df['datetime'].max() - start_time_for_ticks).total_seconds()
    
    for sensor_num, (row, col) in self.sensor_positions.items():
      # 行を反転（matplotlibは下から上へ、我々の定義は上から下へ）
      adjusted_row = 23 - row
      ax = plt.subplot2grid((24, 24), (adjusted_row, col), rowspan=4, colspan=4)
      
      # 電圧データの取得
      voltage_col = f'voltage_no{sensor_num}'
      time_data = df['datetime']
      voltage_data = df[voltage_col]
      
      # 開始時点からの経過秒数を計算
      # original_start_timeが指定されている場合はそれを基準に、なければ現在のdfの開始時刻を使用
      if original_start_time is not None:
        start_time = original_start_time
      else:
        start_time = df['datetime'].iloc[0]
      
      # 経過秒数を計算
      seconds_data = (time_data - start_time).dt.total_seconds()
      
      # プロット
      ax.plot(seconds_data, voltage_data, linewidth=1.5, color=f'C{sensor_num-1}', alpha=0.9)
      
      # タイトルのみ設定（軸ラベルは削除）
      ax.set_title(f'Sensor {sensor_num}', fontsize=18, fontweight='bold', bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
      
      # グリッド線を横軸・縦軸両方に表示
      ax.grid(True, alpha=0.4, linestyle='-', linewidth=0.5)
      ax.set_axisbelow(True)  # グリッド線をデータの下に表示
      
      # 背景を半透明の白に設定
      ax.set_facecolor((1, 1, 1, 0.8))
      
      # Y軸の範囲を0-5Vに固定（全グラフで統一）
      ax.set_ylim(0, 5)
      
      # Y軸の目盛りを1, 3, 5Vに設定
      ax.set_yticks([1, 3, 5])
      
      # X軸に分:秒形式で表示
      def format_time_axis(x, pos):
        """経過秒数を分:秒形式に変換"""
        total_seconds = int(x)
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        return f"{minutes}:{seconds:02d}"
      
      ax.xaxis.set_major_formatter(FuncFormatter(format_time_axis))
      
      # X軸の目盛りを5メモリに設定
      ax.xaxis.set_major_locator(MaxNLocator(nbins=3, integer=False))
      
      ax.tick_params(axis='x', labelsize=16)
      ax.tick_params(axis='y', labelsize=16)
    
    # 目盛り間隔の情報を右上に追加
    self.add_scale_info(fig, df)
    
    plt.tight_layout()
    plt.subplots_adjust(top=0.94, bottom=0.03, left=0.03, right=0.92)
    return fig
  
  def add_scale_info(self, fig, df):
    """
    目盛り間隔の情報を図の右上に追加する
    """
    # データの時間範囲を計算
    time_range = df['datetime'].max() - df['datetime'].min()
    total_seconds = time_range.total_seconds()
    
    # 時間軸の目盛り間隔を計算
    # matplotlibが自動的に設定する目盛りの概算間隔を計算
    data_points = len(df)
    typical_grid_intervals = 10  # 一般的なグラフの目盛り数
    time_per_tick = total_seconds / typical_grid_intervals
    
    # 電圧の範囲を計算（全センサーの平均）
    voltage_cols = [f'voltage_no{i}' for i in range(1, 13)]
    all_voltages = df[voltage_cols].values.flatten()
    voltage_min = np.nanmin(all_voltages)
    voltage_max = np.nanmax(all_voltages)
    voltage_range = voltage_max - voltage_min
    
    # 情報テキストを作成（縦書き用に改行を増やす）
    info_text = f"""Scale Information:

Time Range:
{total_seconds:.1f} seconds

X-axis Grid:
~{time_per_tick:.1f} sec/interval

Y-axis:
Fixed 0-5V
(1V intervals)

Actual Data Range:
{voltage_min:.3f}V - {voltage_max:.3f}V

Data Points:
{len(df)}"""
    
    # 右端に縦長に情報を配置
    fig.text(0.93, 0.5, info_text, 
            fontsize=9, 
            verticalalignment='center', 
            horizontalalignment='left',
            bbox=dict(boxstyle="round,pad=0.5", facecolor="white", alpha=0.9, edgecolor="black"),
            transform=fig.transFigure)
  
  def get_time_range_settings(self, df):
    """
    時間範囲の設定を取得する
    """
    total_duration = (df['datetime'].max() - df['datetime'].min()).total_seconds()
    
    print(f"\n=== 時間範囲設定 ===")
    print(f"データ全体の長さ: {total_duration:.1f}秒")
    
    # 最大秒数の指定
    max_seconds_choice = input("\n表示する最大秒数を指定しますか？ (y/n, Enterでスキップ): ").strip().lower()
    
    if max_seconds_choice in ['y', 'yes']:
      while True:
        try:
          max_seconds = float(input(f"表示する最大秒数を入力してください (最大: {total_duration:.1f}秒): ").strip())
          if 0 < max_seconds <= total_duration:
            break
          else:
            print(f"0より大きく{total_duration:.1f}以下の値を入力してください。")
        except ValueError:
          print("有効な数値を入力してください。")
      
      # 抽出方法の選択
      print(f"\nデータ抽出方法を選択してください:")
      print(f"  1. 最初から{max_seconds}秒")
      print(f"  2. 真ん中の{max_seconds}秒")
      print(f"  3. 最後の{max_seconds}秒")
      
      while True:
        try:
          extraction_choice = input("選択 (1-3): ").strip()
          if extraction_choice in ['1', '2', '3']:
            break
          else:
            print("1, 2, または 3 を入力してください。")
        except ValueError:
          print("有効な選択肢を入力してください。")
      
      return max_seconds, int(extraction_choice)
    else:
      return None, None
  
  def extract_time_range(self, df, max_seconds, extraction_method):
    """
    指定された時間範囲のデータを抽出する
    
    Parameters:
    -----------
    df : DataFrame
      元のデータフレーム
    max_seconds : float
      抽出する最大秒数
    extraction_method : int
      1: 最初から, 2: 真ん中, 3: 最後から
    
    Returns:
    --------
    DataFrame
      抽出されたデータフレーム
    """
    start_time = df['datetime'].iloc[0]
    end_time = df['datetime'].iloc[-1]
    total_duration = (end_time - start_time).total_seconds()
    
    if extraction_method == 1:
      # 最初から max_seconds 秒
      extract_end = start_time + pd.Timedelta(seconds=max_seconds)
      filtered_df = df[df['datetime'] <= extract_end].copy()
      print(f"抽出: 最初の{max_seconds}秒 ({start_time} から {extract_end})")
      
    # 真ん中の部分から指定秒数を抽出する場合
    elif extraction_method == 2:
      # 真ん中の max_seconds 秒
      middle_point = total_duration / 2
      extract_start = start_time + pd.Timedelta(seconds=middle_point - max_seconds/2)
      extract_end = start_time + pd.Timedelta(seconds=middle_point + max_seconds/2)
      filtered_df = df[(df['datetime'] >= extract_start) & (df['datetime'] <= extract_end)].copy()
      print(f"抽出: 真ん中の{max_seconds}秒 ({extract_start} から {extract_end})")
      
    elif extraction_method == 3:
      # 最後の max_seconds 秒
      extract_start = end_time - pd.Timedelta(seconds=max_seconds)
      filtered_df = df[df['datetime'] >= extract_start].copy()
      print(f"抽出: 最後の{max_seconds}秒 ({extract_start} から {end_time})")
    
    print(f"抽出されたデータポイント数: {len(filtered_df)}")
    return filtered_df
  
  def get_csv_file_path(self):
    """
    ユーザーからCSVファイルパスを取得する
    """
    print("\n=== CSVファイル選択 ===")
    
    # デフォルトのデータフォルダを表示
    default_data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "experiment_data", "csv_data")
    
    if os.path.exists(default_data_dir):
      print(f"\n利用可能なCSVファイル（{default_data_dir}）:")
      csv_files = [f for f in os.listdir(default_data_dir) if f.endswith('.csv')]
      if csv_files:
        for i, file in enumerate(csv_files, 1):
          print(f"  {i}. {file}")
        print(f"  {len(csv_files) + 1}. その他のファイルパスを手動入力")
        
        while True:
          try:
            choice = input(f"\n選択してください (1-{len(csv_files) + 1}): ").strip()
            if choice.isdigit():
              choice_num = int(choice)
              if 1 <= choice_num <= len(csv_files):
                selected_file = csv_files[choice_num - 1]
                csv_file_path = os.path.join(default_data_dir, selected_file)
                print(f"選択されたファイル: {csv_file_path}")
                return csv_file_path
              elif choice_num == len(csv_files) + 1:
                break
            print(f"1から{len(csv_files) + 1}の数字を入力してください。")
          except KeyboardInterrupt:
            print("\n操作がキャンセルされました。")
            exit()
    
    # 手動でファイルパスを入力
    while True:
      try:
        csv_file_path = input("\nCSVファイルのフルパスを入力してください: ").strip()
        
        # パスが引用符で囲まれている場合は除去
        if csv_file_path.startswith('"') and csv_file_path.endswith('"'):
          csv_file_path = csv_file_path[1:-1]
        elif csv_file_path.startswith("'") and csv_file_path.endswith("'"):
          csv_file_path = csv_file_path[1:-1]
        
        # ファイルの存在確認
        if os.path.exists(csv_file_path) and csv_file_path.endswith('.csv'):
          print(f"ファイルが確認されました: {csv_file_path}")
          return csv_file_path
        else:
          print("ファイルが見つからないか、CSVファイルではありません。正しいパスを入力してください。")
      
      except KeyboardInterrupt:
        print("\n操作がキャンセルされました。")
        exit()

  def quick_visualization(self, csv_file_path=None):
    """
    クイック可視化実行
    """
    if csv_file_path is None:
      csv_file_path = self.get_csv_file_path()
    
    print("=== PIR Sensor Quick Visualization ===")
    df = self.load_and_process_data(csv_file_path)
    
    if df is None:
      return
    
    print(f"Data points: {len(df)}")
    print(f"Measurement period: {df['datetime'].min()} to {df['datetime'].max()}")
    
    # 元データの開始時刻を保存（時間範囲抽出前）
    original_start_time = df['datetime'].iloc[0]
    
    # 時間範囲の設定を取得
    max_seconds, extraction_method = self.get_time_range_settings(df)
    
    # 時間範囲が指定された場合はデータを抽出
    if max_seconds is not None and extraction_method is not None:
      df = self.extract_time_range(df, max_seconds, extraction_method)
    else:
      # 時間範囲を指定しない場合は、original_start_timeをNoneに設定（0から表示）
      original_start_time = None
    
    # CSVファイル名を取得
    csv_filename = os.path.basename(csv_file_path)
    
    # 物理的レイアウトでプロット
    layout_fig = self.create_sensor_layout_plot(df, csv_filename, original_start_time)
    layout_name = "physical"
    
    # 画像を最大化された状態で表示
    mng = layout_fig.canvas.manager
    try:
      mng.window.wm_state('zoomed')  # Windows用
    except:
      try:
        mng.window.showMaximized()  # Qt backend用
      except:
        try:
          mng.resize(*mng.window.maxsize())  # その他のbackend用
        except:
          pass  # 最大化に失敗した場合は通常表示
    
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
      
      # experiment_data/figure_resultフォルダのパスを設定
      # プロジェクトルートから正しいパスを構築
      script_dir = os.path.dirname(os.path.abspath(__file__))  # src_experimentフォルダ
      project_root = os.path.dirname(script_dir)  # AnimalMiruフォルダ
      figure_dir = os.path.join(project_root, "experiment_data", "figure_result")
      
      # figureフォルダが存在しない場合は作成
      os.makedirs(figure_dir, exist_ok=True)
      
      output_path = os.path.join(figure_dir, filename_with_time)
      layout_fig.savefig(output_path, dpi=300)
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
  print("PIRセンサーデータを可視化するCSVファイルを選択してください。")
  
  # ユーザーからファイルを選択してクイック可視化を実行
  visualizer.quick_visualization()


if __name__ == "__main__":
  main()