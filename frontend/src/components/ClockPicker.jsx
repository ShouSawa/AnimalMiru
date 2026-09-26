import { useEffect, useRef, useState } from "react";
import styles from "./ClockPicker.module.css";

const SIZE = 200;
const CENTER = SIZE / 2;
const OUTER_RADIUS = 80;
const INNER_RADIUS = 52;
const MODES = [
  { key: "hour", label: "時" },
  { key: "minute", label: "分" },
  { key: "second", label: "秒" },
];

const pad2 = (v) => String(v).padStart(2, "0");

// 12時の位置を0として時計回りに index/total 周した座標を返す
function polar(index, total, radius) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

// 時: 外周に0〜11、内周に12〜23 / 分・秒: 外周に5刻みのラベル
function buildLabels(mode) {
  if (mode === "hour") {
    return Array.from({ length: 24 }, (_, v) => ({
      value: v,
      ...polar(v % 12, 12, v < 12 ? OUTER_RADIUS : INNER_RADIUS),
    }));
  }
  return Array.from({ length: 12 }, (_, i) => ({ value: i * 5, ...polar(i, 12, OUTER_RADIUS) }));
}

function handPosition(mode, value) {
  if (mode === "hour") return polar(value % 12, 12, value < 12 ? OUTER_RADIUS : INNER_RADIUS);
  return polar(value, 60, OUTER_RADIUS);
}

// データがある時刻（0時からの秒数の一覧）のうち、表示中のモードで色付けする値（時/分/秒）を求める
function unitsWithData(mode, dataSeconds, hour, minute) {
  if (mode === "hour") return new Set(dataSeconds.map((s) => Math.floor(s / 3600)));
  if (mode === "minute") {
    return new Set(
      dataSeconds
        .filter((s) => Math.floor(s / 3600) === hour)
        .map((s) => Math.floor((s % 3600) / 60))
    );
  }
  const minuteStart = hour * 3600 + minute * 60;
  return new Set(
    dataSeconds.filter((s) => s >= minuteStart && s < minuteStart + 60).map((s) => s - minuteStart)
  );
}

// 分・秒の値(0〜59)を、連続している範囲ごとの [開始, 個数] にまとめる（59→0 の境目もつなげる）
function buildRuns(units) {
  const runs = [];
  for (let v = 0; v < 60; v++) {
    if (!units.has(v)) continue;
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === v) last[1]++;
    else runs.push([v, 1]);
  }
  if (runs.length > 1 && runs[0][0] === 0) {
    const last = runs[runs.length - 1];
    if (last[0] + last[1] === 60) {
      last[1] += runs[0][1];
      runs.shift();
    }
  }
  return runs;
}

// 連続範囲を文字盤外周の円弧として描くSVGパス（各値の前後0.5目盛り分まで塗る）
function arcPath(start, count) {
  if (count >= 60) {
    const top = polar(0, 60, OUTER_RADIUS);
    const bottom = polar(30, 60, OUTER_RADIUS);
    return `M${top.x},${top.y} A${OUTER_RADIUS},${OUTER_RADIUS} 0 1 1 ${bottom.x},${bottom.y} A${OUTER_RADIUS},${OUTER_RADIUS} 0 1 1 ${top.x},${top.y}`;
  }
  const from = polar(start - 0.5, 60, OUTER_RADIUS);
  const to = polar(start + count - 0.5, 60, OUTER_RADIUS);
  // SVGの円弧コマンド: 半周を超えるときは大きい方の弧(large-arc=1)、時計回り(sweep=1)で描く
  return `M${from.x},${from.y} A${OUTER_RADIUS},${OUTER_RADIUS} 0 ${count > 30 ? 1 : 0} 1 ${to.x},${to.y}`;
}

export default function ClockPicker({ hour, minute, second, dataSeconds = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [modeIndex, setModeIndex] = useState(0);
  const [dragValue, setDragValue] = useState(null);
  const containerRef = useRef(null);
  const values = { hour, minute, second };
  const mode = MODES[modeIndex].key;
  const current = dragValue ?? values[mode];

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const openPicker = () => {
    setModeIndex(0);
    setOpen((prev) => !prev);
  };

  // ポインタ位置の角度（と中心からの距離）から値を求める
  const valueFromPointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE - CENTER;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE - CENTER;
    const angle = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    if (mode === "hour") {
      const base = Math.round((angle / (2 * Math.PI)) * 12) % 12;
      const isInner = Math.hypot(x, y) < (OUTER_RADIUS + INNER_RADIUS) / 2;
      return isInner ? base + 12 : base;
    }
    return Math.round((angle / (2 * Math.PI)) * 60) % 60;
  };

  const handlePointerDown = (e) => {
    // 文字盤の外へ出てもドラッグ中の pointermove/pointerup を受け取り続ける
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragValue(valueFromPointer(e));
  };

  const handlePointerMove = (e) => {
    if (dragValue === null) return;
    setDragValue(valueFromPointer(e));
  };

  // 指を離した時点で値を確定し、次のモードへ進む
  const handlePointerUp = () => {
    if (dragValue === null) return;
    onChange({ [mode]: dragValue });
    setDragValue(null);
    if (modeIndex < MODES.length - 1) setModeIndex(modeIndex + 1);
    else setOpen(false);
  };

  const hand = handPosition(mode, current);
  const dataUnits = unitsWithData(mode, dataSeconds, hour, minute);
  const labels = buildLabels(mode);

  return (
    <div className={styles.container} ref={containerRef}>
      <button type="button" className={styles.trigger} onClick={openPicker}>
        {pad2(hour)}:{pad2(minute)}:{pad2(second)}
      </button>
      {open && (
        <div className={styles.popover}>
          <div className={styles.tabs}>
            {MODES.map((m, i) => (
              <button
                key={m.key}
                type="button"
                className={`${styles.tab} ${i === modeIndex ? styles.tabActive : ""}`}
                onClick={() => setModeIndex(i)}
              >
                {pad2(values[m.key])}
                {m.label}
              </button>
            ))}
          </div>
          <svg
            className={styles.face}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width={SIZE}
            height={SIZE}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <circle cx={CENTER} cy={CENTER} r={CENTER - 4} className={styles.dial} />
            {mode === "hour"
              ? labels
                  .filter((l) => dataUnits.has(l.value))
                  .map((l) => (
                    <circle
                      key={`data-${l.value}`}
                      cx={l.x}
                      cy={l.y}
                      r={l.value < 12 ? 12 : 10}
                      className={styles.dataMark}
                    />
                  ))
              : buildRuns(dataUnits).map(([start, count]) => (
                  <path key={`data-${start}`} d={arcPath(start, count)} className={styles.dataArc} />
                ))}
            <line x1={CENTER} y1={CENTER} x2={hand.x} y2={hand.y} className={styles.hand} />
            {mode === "hour" ? (
              <circle cx={CENTER} cy={CENTER} r={3} className={styles.handDot} />
            ) : (
              <>
                <circle cx={CENTER} cy={CENTER} r={20} className={styles.centerBadge} />
                <text x={CENTER} y={CENTER} className={styles.centerValue}>
                  {pad2(current)}
                </text>
              </>
            )}
            <circle cx={hand.x} cy={hand.y} r={13} className={styles.handDot} />
            {labels.map((l) => (
              <text
                key={l.value}
                x={l.x}
                y={l.y}
                className={`${styles.label} ${l.value === current ? styles.labelActive : ""} ${
                  mode === "hour" && l.value >= 12 ? styles.labelInner : ""
                }`}
              >
                {pad2(l.value)}
              </text>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
