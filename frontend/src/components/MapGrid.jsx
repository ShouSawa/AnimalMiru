import styles from "./MapGrid.module.css";

const FIELD_SIZE_M = 30; // 地図の一辺（-15m〜15m）
const MAJOR_STEP_M = 5;
const MINOR_STEP_M = 2.5;
const CELL_STEP_M = 0.5; // 経路推定に使うセルの一辺

// 地図の端(-15m)を 0%、反対の端(15m)を 100% としたときの位置
const toPercent = (m) => ((m + FIELD_SIZE_M / 2) / FIELD_SIZE_M) * 100;
const formatMeter = (m) => (m === 0 ? "0" : `${m}m`);

// 0.5m刻みの格子線（地図の外枠と重なる端は除く）
const GRID_VALUES = Array.from(
  { length: FIELD_SIZE_M / CELL_STEP_M - 1 },
  (_, i) => (i + 1) * CELL_STEP_M - FIELD_SIZE_M / 2
);
// 5mごとを太い破線、2.5mごとを点線、それ以外をセル用の薄い線にする
const lineClass = (m) =>
  m % MAJOR_STEP_M === 0 ? styles.major : m % MINOR_STEP_M === 0 ? styles.minor : styles.cell;
const X_LABEL_VALUES = [-10, -5, 0, 5, 10];
const Y_LABEL_VALUES = [-15, -10, -5, 0, 5, 10, 15];

export default function MapGrid() {
  return (
    <>
      <svg className={styles.grid} viewBox="0 0 100 100" preserveAspectRatio="none">
        {GRID_VALUES.map((m) => (
          <g key={m} className={lineClass(m)}>
            <line x1={toPercent(m)} y1={0} x2={toPercent(m)} y2={100} />
            <line x1={0} y1={toPercent(m)} x2={100} y2={toPercent(m)} />
          </g>
        ))}
      </svg>
      {["top", "bottom"].map((side) =>
        X_LABEL_VALUES.map((m) => (
          <span
            key={`${side}${m}`}
            className={`${styles.label} ${styles[side]}`}
            style={{ left: `${toPercent(m)}%` }}
          >
            {formatMeter(m)}
          </span>
        ))
      )}
      {["left", "right"].map((side) =>
        Y_LABEL_VALUES.map((m) => (
          <span
            key={`${side}${m}`}
            className={`${styles.label} ${styles[side]}`}
            // 地図の上端が +15m なので、縦方向は符号を反転して位置を求める
            style={{ top: `${toPercent(-m)}%` }}
          >
            {formatMeter(m)}
          </span>
        ))
      )}
    </>
  );
}
