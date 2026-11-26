import { useRef, useState } from "react";
import styles from "./CorrectRoute.module.css";
import EnvSettings from "../correctRoute/EnvSettings";
import RouteField from "../correctRoute/RouteField";
import WaypointPanel from "../correctRoute/WaypointPanel";
import { TARGETS } from "../correctRoute/waypoints";

const DEFAULT_INTERVAL_SEC = 4;

function initialSettings() {
  const now = new Date();
  return {
    title: "",
    start: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds(),
    },
    target: TARGETS[0],
    memo: "",
    intervalSec: DEFAULT_INTERVAL_SEC,
  };
}

export default function CorrectRoute() {
  const [settings, setSettings] = useState(initialSettings);
  // 通過点: { id, ix, iy, sec }。並び順が通過順で、sec は実験開始からの通過時間（秒）
  const [points, setPoints] = useState([]);
  const nextId = useRef(0);

  // 最初の点は 00:00、2つ目以降は直前の点から通過間隔だけ後にする
  const addPoint = (ix, iy) => {
    const id = nextId.current++;
    setPoints((prev) => [
      ...prev,
      { id, ix, iy, sec: prev.length ? prev[prev.length - 1].sec + settings.intervalSec : 0 },
    ]);
  };

  const changeSec = (id, sec) => setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, sec } : p)));

  const removePoint = (id) => setPoints((prev) => prev.filter((p) => p.id !== id));

  // from 番目の点を to 番目へ移す。座標は点について動き、通過時間は並び位置に残る
  const movePoint = (from, to) =>
    setPoints((prev) => {
      const next = [...prev];
      next.splice(to, 0, ...next.splice(from, 1));
      return next.map((p, i) => ({ ...p, sec: prev[i].sec }));
    });

  return (
    <div className={styles.page}>
      <h2>正解経路</h2>

      <EnvSettings
        settings={settings}
        lastSec={points.length ? points[points.length - 1].sec : 0}
        onChange={(fields) => setSettings((prev) => ({ ...prev, ...fields }))}
      />

      <div className={styles.body}>
        <div className={styles.fieldScroll}>
          <RouteField points={points} onTap={addPoint} />
        </div>
        <WaypointPanel
          points={points}
          onChangeSec={changeSec}
          onRemove={removePoint}
          onRemoveAll={() => setPoints([])}
          onMove={movePoint}
        />
      </div>
    </div>
  );
}
