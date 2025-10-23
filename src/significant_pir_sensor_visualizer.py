#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PIRセンサーデータ有意性可視化ツール
ノイズレベルを考慮して、有意なピークのみを可視化する
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import os
from datetime import datetime
from matplotlib.patches import Rectangle
from matplotlib.ticker import FuncFormatter
from PIL import Image

# フォント設定
plt.rcParams['font.family'] = 'DejaVu Sans'

class PIRSensorSignificantVisualizer:
  """PIRセンサーデータ有意性可視化クラス"""
  
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
    self.sensor_stats = {}  # 各センサの統計情報を保持
  
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
  
  def calculate_noise_thresholds(self, nothing_csv_path, k=2):
    """
    nothingデータからノイズレベルと閾値を計算する
    PIRセンサは通常時（平均値）から上下に変化するため、絶対偏差で判定する
    
    Parameters:
    -----------
    nothing_csv_path : str
      何もない状態のデータCSVファイルパス
    k : float
      閾値計算の係数（平均からの偏差が k * std を超えたら有意とする）
    """
    print(f"\n=== ノイズレベル計算 ===")
    print(f"Nothingデータ: {os.path.basename(nothing_csv_path)}")
    print(f"閾値係数 k = {k}")
    print(f"判定方法: 通常時電圧からの偏差の絶対値が k×標準偏差を超えたら有意")
    
    nothing_df = self.load_and_process_data(nothing_csv_path)
    if nothing_df is None:
      return False
    
    # 各センサの統計情報を計算
    self.sensor_stats = {}
    for sensor_num in range(1, 13):
      voltage_col = f'voltage_no{sensor_num}'
      if voltage_col in nothing_df.columns:
        mean = nothing_df[voltage_col].mean()
        std = nothing_df[voltage_col].std()
        deviation_threshold = k * std  # 平均からの許容偏差
        
        self.sensor_stats[sensor_num] = {
          'mean': mean,
          'std': std,
          'deviation_threshold': deviation_threshold
        }
        print(f"Sensor {sensor_num:2d}: Mean={mean:.4f}V, Std={std:.4f}V, Deviation Threshold={deviation_threshold:.4f}V")
    
    return True
  
  def filter_significant_data(self, df):
    """
    通常時電圧からの偏差が閾値を超える有意なデータのみを抽出する
    PIRセンサは平均値から上下両方に変化するため、絶対偏差で判定する
    
    Parameters:
    -----------
    df : DataFrame
      フィルタリング対象のデータフレーム
    
    Returns:
    --------
    DataFrame
      フィルタリングされたデータフレーム
    """
    if not self.sensor_stats:
      print("警告: ノイズ閾値が計算されていません。フィルタリングをスキップします。")
      return df
    
    filtered_df = df.copy()
    
    for sensor_num in range(1, 13):
      voltage_col = f'voltage_no{sensor_num}'
      if voltage_col in filtered_df.columns and sensor_num in self.sensor_stats:
        mean = self.sensor_stats[sensor_num]['mean']
        deviation_threshold = self.sensor_stats[sensor_num]['deviation_threshold']
        
        # 平均値からの偏差の絶対値を計算
        deviation = np.abs(filtered_df[voltage_col] - mean)
        
        # 偏差が閾値を超える場合は元の値を保持、そうでない場合は平均値を設定
        # これにより、有意な変化のみがグラフに表示される
        filtered_df[voltage_col] = np.where(
          deviation > deviation_threshold,
          filtered_df[voltage_col],  # 有意な変化：元の値を保持
          mean  # 有意でない：平均値（通常時）を設定
        )
    
    return filtered_df
  
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
    figure_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "figure", "データビジュアル.png")
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
      main_ax.imshow(background_img, extent=[0, 12, 0, 12], aspect='auto', alpha=0.5)
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
      
      # 開始時点からの経過秒数を計算
      # original_start_timeが指定されている場合はそれを基準に、なければ現在のdfの開始時刻を使用
      if original_start_time is not None:
        start_time = original_start_time
      else:
        start_time = df['datetime'].iloc[0]
      
      seconds_data = (time_data - start_time).dt.total_seconds()
      
      # プロット
      ax.plot(seconds_data, voltage_data, linewidth=1.5, color=f'C{sensor_num-1}', alpha=0.9)
      
      # 閾値が計算されている場合は平均値と閾値範囲を表示
      if sensor_num in self.sensor_stats:
        mean = self.sensor_stats[sensor_num]['mean']
        deviation_threshold = self.sensor_stats[sensor_num]['deviation_threshold']
        
        # 平均値（通常時）のライン
        ax.axhline(y=mean, color='green', linestyle='-', linewidth=1.5, alpha=0.7, label=f'Mean: {mean:.2f}V')
        
        # 上限閾値のライン
        upper_threshold = mean + deviation_threshold
        ax.axhline(y=upper_threshold, color='red', linestyle='--', linewidth=1, alpha=0.7, label=f'Upper: {upper_threshold:.2f}V')
        
        # 下限閾値のライン
        lower_threshold = mean - deviation_threshold
        ax.axhline(y=lower_threshold, color='red', linestyle='--', linewidth=1, alpha=0.7, label=f'Lower: {lower_threshold:.2f}V')
      
      # タイトルのみ設定（軸ラベルは削除）
      ax.set_title(f'Sensor {sensor_num}', fontsize=12, fontweight='bold', bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
      
      # グリッド線を横軸・縦軸両方に表示
      ax.grid(True, alpha=0.4, linestyle='-', linewidth=0.5)
      ax.set_axisbelow(True)  # グリッド線をデータの下に表示
      
      # 背景を半透明の白に設定
      ax.set_facecolor((1, 1, 1, 0.8))
      
      # Y軸の範囲を0-5Vに固定（全グラフで統一）
      ax.set_ylim(0, 5)
      
      # Y軸の目盛りを1Vごとに設定
      ax.set_yticks([0, 1, 2, 3, 4, 5])
      
      # X軸に分:秒形式で表示
      def format_time_axis(x, pos):
        """経過秒数を分:秒形式に変換"""
        total_seconds = int(x)
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        return f"{minutes}:{seconds:02d}"
      
      ax.xaxis.set_major_formatter(FuncFormatter(format_time_axis))
      ax.tick_params(axis='x', labelsize=8)
      ax.tick_params(axis='y', labelsize=8)
    
    # 目盛り間隔の情報を右上に追加
    self.add_scale_info(fig, df)
    
    plt.tight_layout()
    plt.subplots_adjust(top=0.93, bottom=0.08)
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
    
    # 情報テキストを作成
    info_text = f"""Scale Information:
Time Range: {total_seconds:.1f} seconds
X-axis Grid: ~{time_per_tick:.1f} sec/interval
Y-axis: Fixed 0-5V (1V intervals)
Actual Data Range: {voltage_min:.3f}V - {voltage_max:.3f}V
Data Points: {len(df)}
Filtering: {"Enabled" if self.sensor_stats else "Disabled"}"""
    
    # 右上に情報を配置
    fig.text(0.98, 0.98, info_text, 
            fontsize=10, 
            verticalalignment='top', 
            horizontalalignment='right',
            bbox=dict(boxstyle="round,pad=0.5", facecolor="white", alpha=0.9, edgecolor="black"),
            transform=fig.transFigure)
  
  def get_csv_file_path(self, prompt_message="CSVファイルを選択してください"):
    """
    ユーザーからCSVファイルパスを取得する
    """
    print(f"\n=== {prompt_message} ===")
    
    # デフォルトのデータフォルダを表示
    default_data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "experiment_data", "csv_data")
    
    if os.path.exists(default_data_dir):
      print(f"\n利用可能なCSVファイル（{default_data_dir}）:")
      csv_files = sorted([f for f in os.listdir(default_data_dir) if f.endswith('.csv')])
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

  def significant_visualization(self):
    """
    有意性を考慮した可視化実行
    """
    print("=" * 70)
    print("PIR Sensor Significant Data Visualization")
    print("=" * 70)
    
    # 1. 固定のNothingデータで閾値計算
    print("\n【ステップ1】ノイズレベル計算")
    
    # nothing.csvのパスを固定
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    nothing_csv_path = os.path.join(project_root, "experiment_data", "csv_data", "nothing.csv")
    
    # ファイルの存在確認
    if not os.path.exists(nothing_csv_path):
      print(f"エラー: Nothingデータが見つかりません: {nothing_csv_path}")
      print("experiment_data/csv_data/nothing.csv を配置してください。")
      return
    
    print(f"使用するNothingデータ: {nothing_csv_path}")
    
    # 閾値係数kの入力
    k = 2
    
    # ノイズ閾値を計算
    if not self.calculate_noise_thresholds(nothing_csv_path, k):
      print("エラー: ノイズ閾値の計算に失敗しました。")
      return
    
    # 2. 対象データの選択
    print("\n【ステップ2】可視化する対象データを選択")
    target_csv_path = self.get_csv_file_path("可視化する対象データを選択")
    
    print("\n=== PIR Sensor Significant Visualization ===")
    df = self.load_and_process_data(target_csv_path)
    
    if df is None:
      return
    
    print(f"Data points: {len(df)}")
    print(f"Measurement period: {df['datetime'].min()} to {df['datetime'].max()}")
    
    # 3. 有意なデータのみをフィルタリング
    print("\n【ステップ3】閾値を超える有意なデータのみを抽出")
    df = self.filter_significant_data(df)
    
    # 元データの開始時刻を保存（時間範囲抽出前）
    original_start_time = df['datetime'].iloc[0]
    
    # 4. 時間範囲の設定を取得
    max_seconds, extraction_method = self.get_time_range_settings(df)
    
    # 時間範囲が指定された場合はデータを抽出
    if max_seconds is not None and extraction_method is not None:
      df = self.extract_time_range(df, max_seconds, extraction_method)
    else:
      # 時間範囲を指定しない場合は、original_start_timeをNoneに設定（0から表示）
      original_start_time = None
    
    # CSVファイル名を取得
    csv_filename = os.path.basename(target_csv_path)
    
    # タイトルに時間範囲情報を追加
    title = "PIR Sensor Data - Significant Peaks Only"
    if max_seconds is not None:
      extraction_methods = {1: "First", 2: "Middle", 3: "Last"}
      title += f" ({extraction_methods[extraction_method]} {max_seconds}s)"
    
    # 物理的レイアウトでプロット
    layout_fig = self.create_sensor_layout_plot(df, title, csv_filename, original_start_time)
    layout_name = "significant"
    
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
        filename = f"pir_sensor_significant_{layout_name}"
      
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
      layout_fig.savefig(output_path, dpi=300, bbox_inches='tight')
      print(f"Graph saved: {output_path}")
    else:
      print("Graph not saved.")


def main():
  """
  メイン関数 - 有意性可視化
  """
  visualizer = PIRSensorSignificantVisualizer()
  
  print("=" * 70)
  print("PIR Sensor Significant Data Visualization")
  print("ノイズレベルを考慮して、有意なピークのみを可視化します")
  print("=" * 70)
  
  # 有意性を考慮した可視化を実行
  visualizer.significant_visualization()


if __name__ == "__main__":
  main()
