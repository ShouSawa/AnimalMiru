export const FIELD_SIZE_M = 30; // 地図の一辺（-15m〜15m）
export const NX = 60; // 格子の1辺のセル数
export const CELL = 0.5; // 1セルの一辺[m]

// 座標[m]（東が+x、北が+y）を地図上の位置[%]にする。地図の左端が x=-15m、上端が y=+15m
export const toLeftPct = (x) => ((x + FIELD_SIZE_M / 2) / FIELD_SIZE_M) * 100;
export const toTopPct = (y) => ((FIELD_SIZE_M / 2 - y) / FIELD_SIZE_M) * 100;
