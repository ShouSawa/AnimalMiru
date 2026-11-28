import { useRef, useState } from "react";
import styles from "./CorrectRoute.module.css";
import EnvSettings from "../correctRoute/EnvSettings";
import RouteField from "../correctRoute/RouteField";
import WaypointPanel from "../correctRoute/WaypointPanel";
import { TARGETS, fromDate, toDate } from "../correctRoute/waypoints";
import { postRoute } from "../correctRoute/routeApi";

const DEFAULT_INTERVAL_SEC = 4;

function initialSettings() {
  return {
    title: "",
    start: fromDate(new Date()),
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
  const [saving, setSaving] = useState(false);

  const record = async () => {
    setSaving(true);
    try {
      const { route_id, overwritten } = await postRoute({
        title: settings.title,
        start_time: toDate(settings.start).getTime() / 1000,
        target: settings.target,
        memo: settings.memo,
        interval_sec: settings.intervalSec,
        waypoints: points.map((p) => [p.ix, p.iy, p.sec]),
      });
      window.alert(`${overwritten ? "上書き保存" : "記録"}しました（route_id: ${route_id}）`);
    } catch (e) {
      window.alert(`記録できませんでした: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 保存されている正解経路で、設定と通過点を置き換える
  const loadRoute = (route) => {
    setSettings({
      title: route.title,
      start: fromDate(new Date(route.start_time * 1000)),
      target: route.target,
      memo: route.memo,
      intervalSec: route.interval_sec,
    });
    setPoints(route.waypoints.map(([ix, iy, sec]) => ({ id: nextId.current++, ix, iy, sec })));
  };

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
        onRecord={record}
        recordDisabled={saving || !settings.title.trim() || !points.length}
        onLoad={loadRoute}
        onClear={() => {
          setSettings(initialSettings());
          setPoints([]);
        }}
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
