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

// 開始時刻からの経過秒数を「分:秒」表記に変換する
function formatClockTick(date) {
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

const X_AXIS_TICK_COUNT = 5;
const Y_MIN_VOLTAGE = 0;
const Y_MAX_VOLTAGE = 5;
const X_MINOR_DIVISIONS_PER_TICK = 5; // 目盛り間をさらに何分割して細かいグリッドを引くか

export default function SensorChart({
  label = "Sensor",
  top,
  left,
  seed = 1,
  pointCount = 40,
  valueUnit = "voltage", // "voltage" | "hex" | "decimal"
  yTicks = [5, 3, 1],
  timeRangeSeconds = 40, // 横軸の表示範囲（設定エリアから変更可能）
  startDateTime = new Date(2026, 0, 22, 14, 9, 39), // 横軸の起点時刻（設定エリアから変更可能）
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
  for (let i = 0; i < X_AXIS_TICK_COUNT; i++) {
    const offsetSeconds = (timeRangeSeconds * i) / (X_AXIS_TICK_COUNT - 1);
    const tickDate = new Date(startDateTime.getTime() + offsetSeconds * 1000);
    timeTicks.push(formatClockTick(tickDate));
  }

  // 横線: 1V刻みでグリッドを引き、目盛り値と最低電圧(0V)の位置だけ実線にする
  const yGridLines = [];
  for (let v = Y_MIN_VOLTAGE; v <= Y_MAX_VOLTAGE; v++) {
    yGridLines.push({
      y: height - (v / Y_MAX_VOLTAGE) * height,
      isMajor: v === Y_MIN_VOLTAGE || yTicks.includes(v),
    });
  }

  // 縦線: 目盛り間をさらに分割して細かいグリッドを引き、目盛り(最低時間=開始時刻を含む)の位置だけ実線にする
  const xMinorCount = (X_AXIS_TICK_COUNT - 1) * X_MINOR_DIVISIONS_PER_TICK;
  const xGridLines = [];
  for (let j = 0; j <= xMinorCount; j++) {
    xGridLines.push({
      x: (j / xMinorCount) * width,
      isMajor: j % X_MINOR_DIVISIONS_PER_TICK === 0,
    });
  }

  return (
    <div className={styles.card} style={{ "--top": top, "--left": left }}>
      <div className={styles.corner} />
      <div className={styles.header}>{label}</div>
      <div className={styles.body}>
        <div className={styles.yAxis}>
          {yTicks.map((t) => {
            const topPercent =
              ((Y_MAX_VOLTAGE - t) / (Y_MAX_VOLTAGE - Y_MIN_VOLTAGE)) * 100;
            return (
              <span key={t} style={{ top: `${topPercent}%` }}>
                {formatTick(t, valueUnit)}
              </span>
            );
          })}
        </div>
        <div className={styles.chartArea}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className={styles.svg}
          >
            {yGridLines.map(({ y, isMajor }, i) => (
              <line
                key={`y-grid-${i}`}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke="#000"
                strokeWidth="0.4"
                strokeOpacity={isMajor ? 0.3 : 0.18}
                strokeDasharray={isMajor ? undefined : "0.6,1.4"}
                strokeLinecap="round"
              />
            ))}
            {xGridLines.map(({ x, isMajor }, i) => (
              <line
                key={`x-grid-${i}`}
                x1={x}
                y1={0}
                x2={x}
                y2={height}
                stroke="#000"
                strokeWidth="0.4"
                strokeOpacity={isMajor ? 0.3 : 0.18}
                strokeDasharray={isMajor ? undefined : "0.6,1.4"}
                strokeLinecap="round"
              />
            ))}
            <path d={path} fill="none" stroke="#2d9e4f" strokeWidth="1.2" />
          </svg>
          <div className={styles.xAxis}>
            {timeTicks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
