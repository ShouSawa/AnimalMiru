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

export default function ClockPicker({ hour, minute, second, onChange }) {
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
            {buildLabels(mode).map((l) => (
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
