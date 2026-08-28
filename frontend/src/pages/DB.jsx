import { useEffect, useState } from "react";

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
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <h2>DBリアルタイムモニター</h2>
        {/* 接続状態インジケーター */}
        <span style={{
          background: connected ? "#2d6a4f" : "#c0392b",
          color: "white",
          padding: "4px 10px",
          borderRadius: "12px",
          fontSize: "13px",
        }}>
          {connected ? "● 接続中" : "○ 切断"}
        </span>
      </div>

      <p style={{ color: "#555", fontSize: "14px" }}>
        受信件数: {logs.length} 件
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "#2d6a4f", color: "white" }}>
              <th style={th}>ノード番号</th>
              <th style={th}>通信強度</th>
              <th style={th}>タイムスタンプ</th>
              <th style={th}>ペイロード（16進）</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#f9f9f9" : "white" }}>
                <td style={td}>{log.node_id}</td>
                <td style={td}>{log.rssi_hex}</td>
                <td style={td}>
                  {new Date(log.timestamp * 1000).toLocaleString("ja-JP")}
                </td>
                <td style={{ ...td, fontFamily: "monospace", fontSize: "12px" }}>
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

const th = {
  padding: "10px 16px",
  textAlign: "left",
  borderBottom: "2px solid #1a4a32",
};
const td = {
  padding: "8px 16px",
  borderBottom: "1px solid #ddd",
};