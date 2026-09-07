import { useEffect, useMemo, useState } from "react";
import styles from "./DB.module.css";

const SORT_ORDER_STORAGE_KEY = "animalMiru.dbSortOrder";

function loadSortOrder() {
  try {
    const saved = localStorage.getItem(SORT_ORDER_STORAGE_KEY);
    return saved === "asc" || saved === "desc" ? saved : "desc";
  } catch {
    return "desc";
  }
}

export default function DB() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  // 表示順（desc: 新しい順＝デフォルト / asc: 古い順）
  const [sortOrder, setSortOrder] = useState(loadSortOrder);

  const handleSortOrderChange = (e) => {
    const value = e.target.value;
    setSortOrder(value);
    try {
      localStorage.setItem(SORT_ORDER_STORAGE_KEY, value);
    } catch {
      // ストレージが使えない環境では保存をあきらめる
    }
  };

  // logsは受信順に積まれるだけなので、表示直前に毎回タイムスタンプで並び替える
  const sortedLogs = useMemo(() => {
    const arr = [...logs];
    arr.sort((a, b) =>
      sortOrder === "desc" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    );
    return arr;
  }, [logs, sortOrder]);

  useEffect(() => {
    // ページを開いた時点で、DBに既に保存済みの直近データを読み込む
    // （WebSocketはこの後の新着データしか配信しないため）
    fetch(`/api/sensor-data/recent`)
      .then((res) => res.json())
      .then((data) => setLogs(data.sensor_data ?? []))
      .catch((err) => console.error("初期データ取得失敗:", err));

    // WebSocket接続（Nginx経由）
    const ws = new WebSocket(`ws://${window.location.host}/ws/realtime`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // 受信したsensor_dataを先頭に追加（最大200件）
      setLogs((prev) => [...data.sensor_data, ...prev].slice(0, 200));
    };

    return () => ws.close();
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>DBリアルタイムモニター</h2>
        {/* 接続状態インジケーター */}
        <span
          className={`${styles.statusBadge} ${
            connected ? styles.statusConnected : styles.statusDisconnected
          }`}
        >
          {connected ? "● 接続中" : "○ 切断"}
        </span>
      </div>

      <p className={styles.count}>受信件数: {logs.length} 件</p>

      {/* 設定エリア */}
      <div className={styles.settingsPanel}>
        <div className={styles.settingsPanelTitle}>設定エリア</div>
        <label className={styles.settingsField}>
          表示順
          <select
            className={styles.select}
            value={sortOrder}
            onChange={handleSortOrderChange}
          >
            <option value="desc">新しい順</option>
            <option value="asc">古い順</option>
          </select>
        </label>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.theadRow}>
              <th className={styles.th}>ノード番号</th>
              <th className={styles.th}>通信強度</th>
              <th className={styles.th}>タイムスタンプ</th>
              <th className={styles.th}>ペイロード（16進）</th>
            </tr>
          </thead>
          <tbody>
            {sortedLogs.map((log, i) => (
              <tr
                key={`${log.node_id}-${log.timestamp}-${i}`}
                className={i % 2 === 0 ? styles.rowEven : styles.rowOdd}
              >
                <td className={styles.td}>{log.node_id}</td>
                <td className={styles.td}>{log.rssi_hex}</td>
                <td className={styles.td}>
                  {new Date(log.timestamp * 1000).toLocaleString("ja-JP")}
                </td>
                <td className={`${styles.td} ${styles.payloadTd}`}>
                  {log.payload_hex}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
