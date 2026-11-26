import { useRef } from "react";
import styles from "./WaypointPanel.module.css";
import TimeInput from "./TimeInput";
import { rainbowColor } from "./waypoints";
import { NX } from "../estimate/geometry";

// 通過点（{ id, ix, iy, sec }、通過順）の一覧。番号と色は並び順で決まり、左の「⠿」をドラッグすると順番を入れ替えられる
export default function WaypointPanel({ points, onChangeSec, onRemove, onRemoveAll, onMove }) {
  const dragFrom = useRef(null);

  const handleDrop = (to) => {
    if (dragFrom.current !== null) onMove(dragFrom.current, to);
    dragFrom.current = null;
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>通過点エリア</div>
        <button
          type="button"
          className={styles.removeAll}
          disabled={!points.length}
          onClick={() => window.confirm("通過点をすべて削除しますか？") && onRemoveAll()}
        >
          一括削除
        </button>
      </div>
      <ul className={styles.list}>
        {points.map((p, i) => (
          <li key={p.id} className={styles.row} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(i)}>
            <span
              className={styles.handle}
              draggable
              onDragStart={(e) => {
                dragFrom.current = i;
                e.dataTransfer.setData("text/plain", ""); // Firefoxはデータを設定しないとドラッグが始まらない
                e.dataTransfer.setDragImage(e.currentTarget.parentElement, 0, 0); // 行全体をドラッグ中の見た目にする
              }}
            >
              ⠿
            </span>
            <span className={styles.number}>{i + 1}</span>
            <span className={styles.swatch} style={{ background: rainbowColor(i) }} />
            {/* セルの左下の角を、フィールドの中心を原点にした0.5m単位の整数で表す */}
            <span className={styles.coord}>
              x:{p.ix - NX / 2}, y:{p.iy - NX / 2}
            </span>
            <TimeInput sec={p.sec} onChange={(sec) => onChangeSec(p.id, sec)} />
            <button type="button" className={styles.remove} onClick={() => onRemove(p.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
