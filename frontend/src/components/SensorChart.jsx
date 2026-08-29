import { useMemo } from "react";
import styles from "./SensorChart.module.css";

// 再レンダリングされても波形が変わらないようにするための簡易シード付き乱数
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// センサ値（0V〜5V基準）を指定の単位の目盛りラベルに変換する
function formatTick(voltage, valueUnit) {
  const ratio = voltage / 5;
  if (valueUnit === "hex") {
    return Math.round(ratio * 255)
      .toString(16)
      .toUpperCase()
      .padStart(2, "0");
  }
  if (valueUnit === "decimal") {
    return String(Math.round(ratio * 255));
  }
  return String(voltage);
}

function formatTimeTick(minutes) {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

export default function SensorChart({
  label = "Sensor",
  top,
  left,
  seed = 1,
  pointCount = 40,
  valueUnit = "voltage", // "voltage" | "hex" | "decimal"（後で切替可能にする）
  yTicks = [5, 3, 1],
  timeRangeMinutes = 40, // 横軸の表示範囲（後で変更可能にする）
  timeTickIntervalMinutes = 20, // 横軸の目盛間隔（後で変更可能にする）
}) {
  // TODO: 実データ（WebSocket/DB由来）に置き換える。現在はダミー波形。
  const values = useMemo(() => {
    const rand = mulberry32(seed);
    const points = [];
    let v = 2.5 + (rand() - 0.5) * 2;
    for (let i = 0; i < pointCount; i++) {
      v += (rand() - 0.5) * 1.2;
      v = Math.min(4.6, Math.max(1.2, v));
      points.push(v);
    }
    return points;
  }, [seed, pointCount]);

  const width = 200;
  const height = 70;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - (v / 5) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const timeTicks = [];
  for (let m = 0; m <= timeRangeMinutes; m += timeTickIntervalMinutes) {
    timeTicks.push(formatTimeTick(m));
  }

  return (
    <div className={styles.card} style={{ "--top": top, "--left": left }}>
      <div className={styles.corner} />
      <div className={styles.header}>{label}</div>
      <div className={styles.body}>
        <div className={styles.yAxis}>
          {yTicks.map((t) => (
            <span key={t}>{formatTick(t, valueUnit)}</span>
          ))}
        </div>
        <div className={styles.chartArea}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className={styles.svg}
          >
            <path d={path} fill="none" stroke="#2d9e4f" strokeWidth="1.2" />
          </svg>
          <div className={styles.xAxis}>
            {timeTicks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
          <div className={styles.xAxisBar}>
            <span
              className={styles.xAxisBarActive}
              style={{ width: `${100 / (timeTicks.length - 1)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
