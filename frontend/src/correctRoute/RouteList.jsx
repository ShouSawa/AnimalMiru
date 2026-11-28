import { useEffect, useRef, useState } from "react";
import styles from "./RouteList.module.css";
import { deleteRoute, fetchRoutes } from "./routeApi";

// 保存されている正解経路のプルダウン一覧。開くたびに取得し直し、選んだ経路を onSelect で伝える。✕でDBから削除する
export default function RouteList({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [routes, setRoutes] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const toggle = async () => {
    if (open) return setOpen(false);
    try {
      setRoutes((await fetchRoutes()).routes);
      setOpen(true);
    } catch (e) {
      window.alert(`一覧を取得できませんでした: ${e.message}`);
    }
  };

  const select = (route) => {
    onSelect(route);
    setOpen(false);
  };

  const remove = async ({ route_id, title }) => {
    if (!window.confirm(`正解経路「${title}」を削除しますか？`)) return;
    try {
      await deleteRoute(route_id);
      setRoutes((prev) => prev.filter((r) => r.route_id !== route_id));
    } catch (e) {
      window.alert(`削除できませんでした: ${e.message}`);
    }
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button type="button" className={styles.trigger} onClick={toggle}>
        正解経路一覧 {open ? "▴" : "▾"}
      </button>
      {open && (
        <ul className={styles.list}>
          {!routes.length && <li className={styles.empty}>保存された正解経路はありません</li>}
          {routes.map((route) => (
            <li key={route.route_id} className={styles.row}>
              <button type="button" className={styles.item} onClick={() => select(route)}>
                {route.title}
                <span className={styles.detail}>{route.target}</span>
              </button>
              <button type="button" className={styles.remove} onClick={() => remove(route)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
