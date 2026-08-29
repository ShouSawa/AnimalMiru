import styles from "./Home.module.css";
import SensorChart from "../components/SensorChart";

export default function Home() {
  // テストフィールドの仮ノード座標（後から実測値に差し替え可能）
  // charts: 各ノードに付いている3つのセンサのグラフ表示位置（仮）
  const nodes = [
    {
      node_id: "0002",
      label: "ノードA",
      top: "20%",
      left: "80%",
      charts: [
        { top: "6%", left: "82%" },
        { top: "24%", left: "96%" },
        { top: "38%", left: "62%" },
      ],
    },
    {
      node_id: "0003",
      label: "ノードB",
      top: "80%",
      left: "80%",
      charts: [
        { top: "74%", left: "96%" },
        { top: "92%", left: "68%" },
        { top: "60%", left: "62%" },
      ],
    },
    {
      node_id: "0004",
      label: "ノードC",
      top: "80%",
      left: "20%",
      charts: [
        { top: "74%", left: "4%" },
        { top: "92%", left: "32%" },
        { top: "60%", left: "38%" },
      ],
    },
    {
      node_id: "0005",
      label: "ノードD",
      top: "20%",
      left: "20%",
      charts: [
        { top: "6%", left: "18%" },
        { top: "24%", left: "4%" },
        { top: "38%", left: "38%" },
      ],
    },
  ];

  return (
    <div className={styles.page}>
      <h2>テストフィールド - 行動経路表示</h2>

      {/* 地図エリア：後からLeafletに差し替える四角いプレースホルダー */}
      <div className={styles.mapArea}>

        {/* 仮ラベル（Leaflet導入後に削除） */}
        <span className={styles.mapLabel}>
          ※ この領域は後からLeaflet地図に差し替えます
        </span>

        {/* センサノードのピン */}
        {nodes.map((node) => (
          <div
            key={node.node_id}
            className={styles.nodePin}
            style={{ "--top": node.top, "--left": node.left }}
          >
            📡
            <span>{node.node_id}</span>
          </div>
        ))}

        {/* 各センサ値グラフ（枠のみ・ダミーデータ表示。実データ配線は後で行う） */}
        {nodes.map((node) =>
          node.charts.map((pos, i) => (
            <SensorChart
              key={`${node.node_id}-${i}`}
              label={`Sensor ${i + 1}`}
              seed={Number(node.node_id) * 10 + i}
              top={pos.top}
              left={pos.left}
            />
          ))
        )}
      </div>

      {/* ノード一覧 */}
      <div className={styles.nodeList}>
        {nodes.map((node) => (
          <div key={node.node_id} className={styles.nodeCard}>
            <div className={styles.nodeCardLabel}>{node.label}</div>
            <div className={styles.nodeCardId}>{node.node_id}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
