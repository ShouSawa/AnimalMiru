import styles from "./MapGrid.module.css";

const FIELD_SIZE_M = 30; // 地図の一辺（-15m〜15m）
const MAJOR_STEP_M = 5;

// 地図の端(-15m)を 0%、反対の端(15m)を 100% としたときの位置
const toPercent = (m) => ((m + FIELD_SIZE_M / 2) / FIELD_SIZE_M) * 100;
const formatMeter = (m) => (m === 0 ? "0" : `${m}m`);

// 2.5m刻みの格子線（5mごとを太い破線にする）
const GRID_VALUES = [-12.5, -10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10, 12.5];
const X_LABEL_VALUES = [-10, -5, 0, 5, 10];
const Y_LABEL_VALUES = [-15, -10, -5, 0, 5, 10, 15];

export default function MapGrid() {
  return (
    <>
      <svg className={styles.grid} viewBox="0 0 100 100" preserveAspectRatio="none">
        {GRID_VALUES.map((m) => (
          <g key={m} className={m % MAJOR_STEP_M === 0 ? styles.major : styles.minor}>
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
