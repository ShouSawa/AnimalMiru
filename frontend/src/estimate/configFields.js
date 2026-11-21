// 編集できる estimator_config の列。type は列のDB上の型、nullable は空欄でNULLにできるか
export const CONFIG_FIELDS = [
  { key: "name", label: "設定名", type: "text" },
  { key: "code_version", label: "計算プログラムの版", type: "text", nullable: true },
  { key: "note", label: "メモ", type: "text", nullable: true },
  { key: "grid_nx", label: "格子の東西セル数", type: "smallint" },
  { key: "grid_ny", label: "格子の南北セル数", type: "smallint" },
  { key: "cell_size_m", label: "1セルの一辺 [m]", type: "real" },
  { key: "grid_x_min_m", label: "格子の西端x [m]", type: "real" },
  { key: "grid_y_min_m", label: "格子の南端y [m]", type: "real" },
  { key: "map_encoding", label: "map_zの形式（1=uint8, 2=uint16）", type: "smallint" },
  { key: "window_sec", label: "推定窓の長さ [s]", type: "smallint" },
  { key: "delay_sec", label: "計算の遅れ delay_sec [s]", type: "real" },
  { key: "min_samples", label: "窓内の最小サンプル数", type: "smallint" },
  { key: "active_thresh_v", label: "反応ありの振幅 [V]", type: "real" },
  { key: "fov_half_deg", label: "視野の半角 [度]", type: "real" },
  { key: "range_m", label: "検知距離 [m]", type: "real" },
  { key: "d0_m", label: "反応が弱まる距離 d0 [m]", type: "real" },
  { key: "sigma_obs", label: "観測の揺らぎ σ_s", type: "real" },
  { key: "epsilon", label: "外れ値の下限 ε", type: "real" },
  { key: "beta", label: "観測の影響を弱める指数 β", type: "real" },
  { key: "sigma_move_m", label: "動きの幅 σ [m]", type: "real" },
  { key: "quiet_reset_sec", label: "無反応で一様に戻す秒数", type: "smallint", nullable: true },
];

// 編集できる estimator_sensor の列（12センサ×2列）。key は drafts 用の一意なキー
export const SENSOR_FIELDS = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((sensorNo) => [
  { key: `noise_floor_${sensorNo}`, sensorNo, column: "noise_floor", label: `センサ${sensorNo} 雑音下限`, type: "real" },
  { key: `upper_level_${sensorNo}`, sensorNo, column: "upper_level", label: `センサ${sensorNo} 反応1.0の上限`, type: "real" },
]);

// 設定 config が持つ、センサ列 field の値
export const sensorValue = (config, field) =>
  config.sensors.find((s) => s.sensor_no === field.sensorNo)[field.column];

// 入力欄の文字列を列の型の値にする（空欄は nullable な列なら null）。不正ならエラーを投げる
export function parseFieldValue(field, text) {
  const trimmed = text.trim();
  if (trimmed === "") {
    if (field.nullable) return null;
    if (field.type === "text") return "";
    throw new Error(`${field.label}は空欄にできません`);
  }
  if (field.type === "text") return trimmed;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || (field.type === "smallint" && !Number.isInteger(value))) {
    throw new Error(`${field.label}は${field.type === "smallint" ? "整数" : "数値"}で入力してください`);
  }
  return value;
}
