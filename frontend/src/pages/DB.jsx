import { useEffect, useState } from "react";
import styles from "./DB.module.css";

export default function DB() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);

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
            {logs.map((log, i) => (
              <tr key={i} className={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
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
