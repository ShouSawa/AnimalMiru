import { useEffect, useState } from "react";
import styles from "./SensorChart.module.css";

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

// 横幅をこの数の区間に分け、区間ごとに最小値と最大値だけを描く（点が多いときの描画負荷を抑える）
const DECIMATE_BUCKETS = 400;
const ZOOM_DECIMATE_BUCKETS = 1500; // 拡大表示では横幅が広い分、細かく描く
// マウスを乗せたときの拡大倍率と、拡大表示を画面端から離す余白(px)
const ZOOM_SCALE = 2.5;
const ZOOM_MARGIN = 8;
// 前の点からこの秒数以上あいたら、データが途切れているとみなして線をつながない
const GAP_SECONDS = 3;

// [[UNIX秒, 値(0〜255)], ...] を、途切れ箇所で分割したSVGのpath文字列に変換する
function buildPath(points, startSec, rangeSec, width, height, buckets) {
  const segments = [];
  let bucket = null;
  let prevT = null;
  const flush = () => {
    if (!bucket) return;
    // 区間内の最小値・最大値を、現れた順に並べて波形の形を保つ
    const pair = bucket.minI < bucket.maxI ? [bucket.min, bucket.max] : [bucket.max, bucket.min];
    const x = bucket.x;
    for (const v of bucket.min === bucket.max ? [bucket.min] : pair) {
      segments[segments.length - 1].push(`${x.toFixed(1)},${(height - (v / 255) * height).toFixed(1)}`);
    }
    bucket = null;
  };

  points.forEach(([t, v], i) => {
    if (prevT === null || t - prevT >= GAP_SECONDS) {
      flush();
      segments.push([]);
    }
    prevT = t;
    const idx = Math.floor(((t - startSec) / rangeSec) * buckets);
    if (bucket && bucket.idx !== idx) flush();
    if (!bucket) {
      bucket = { idx, x: ((t - startSec) / rangeSec) * width, min: v, max: v, minI: i, maxI: i };
    } else {
      if (v < bucket.min) Object.assign(bucket, { min: v, minI: i });
      if (v > bucket.max) Object.assign(bucket, { max: v, maxI: i });
    }
  });
  flush();

  return segments
    .filter((s) => s.length > 0)
    // 1点しかない区間は見えないので、同じ位置に短い横線を引いて点として表示する
    .map((s) => (s.length === 1 ? `M${s[0]} h0.8` : `M${s.join(" L")}`))
    .join(" ");
}

const X_AXIS_TICK_COUNT = 5;
const Y_MIN_VOLTAGE = 0;
const Y_MAX_VOLTAGE = 5;
const X_MINOR_DIVISIONS_PER_TICK = 5; // 目盛り間をさらに何分割して細かいグリッドを引くか

export default function SensorChart({
  label = "Sensor",
  top,
  left,
  points = [], // [[UNIX秒, 値(0〜255)], ...]（時刻の昇順）
  valueUnit = "voltage", // "voltage" | "hex" | "decimal"
  yTicks = [5, 3, 1],
  timeRangeSeconds = 40, // 横軸の表示範囲（設定エリアから変更可能）
  timeAxisMode = "clock", // "clock": 時刻 | "elapsed": 0秒からの経過時間
  startDateTime = new Date(2026, 0, 22, 14, 9, 39), // 横軸の起点時刻（設定エリアから変更可能）
}) {
  const width = 200;
  const height = 70;
  const startSec = startDateTime.getTime() / 1000;
  // 拡大表示の左上座標（画面基準）。マウスが乗っていない間は null
  const [zoomPos, setZoomPos] = useState(null);

  // スクロールすると拡大表示が元のグラフからずれるので閉じる（地図エリア内の横スクロールも拾うため capture で登録）
  useEffect(() => {
    if (!zoomPos) return;
    const close = () => setZoomPos(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [zoomPos]);

  // 元のグラフの中心を基準に拡大し、画面からはみ出す場合は内側へずらす
  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const zoomWidth = rect.width * ZOOM_SCALE;
    const zoomHeight = rect.height * ZOOM_SCALE;
    const clamp = (v, max) => Math.min(Math.max(v, ZOOM_MARGIN), max - ZOOM_MARGIN);
    setZoomPos({
      left: clamp(rect.left + rect.width / 2 - zoomWidth / 2, window.innerWidth - zoomWidth),
      top: clamp(rect.top + rect.height / 2 - zoomHeight / 2, window.innerHeight - zoomHeight),
    });
  };

  const timeTicks = [];
  for (let i = 0; i < X_AXIS_TICK_COUNT; i++) {
    const offsetSeconds = (timeRangeSeconds * i) / (X_AXIS_TICK_COUNT - 1);
    // 経過時間は 0時0分0秒 起点の Date にして時刻と同じ「分:秒」表記に揃える（端数の秒は切り捨て）
    const baseTime = timeAxisMode === "elapsed" ? new Date(0, 0, 1).getTime() : startDateTime.getTime();
    const tickDate = new Date(baseTime + offsetSeconds * 1000);
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

  // 通常表示と拡大表示で共通の中身。拡大表示は全体を ZOOM_SCALE 倍するので、線が太くなりすぎないよう細くする
  const renderContent = (buckets, lineWidth) => (
    <>
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
            <path
              d={buildPath(points, startSec, timeRangeSeconds, width, height, buckets)}
              fill="none"
              stroke="#2d9e4f"
              strokeWidth={lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className={styles.xAxis}>
            {timeTicks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div
        className={styles.card}
        style={{ "--top": top, "--left": left }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setZoomPos(null)}
      >
        {renderContent(DECIMATE_BUCKETS, 1.2)}
      </div>
      {/* .card は transform を持ち position: fixed の基準になってしまうため、拡大表示は兄弟要素として置く */}
      {zoomPos && (
        <div
          className={styles.zoom}
          style={{ left: zoomPos.left, top: zoomPos.top, "--zoom-scale": ZOOM_SCALE }}
        >
          {renderContent(ZOOM_DECIMATE_BUCKETS, 0.6)}
        </div>
      )}
    </>
  );
}
