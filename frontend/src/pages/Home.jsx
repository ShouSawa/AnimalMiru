import { useState } from "react";
import styles from "./Home.module.css";
import SensorChart from "../components/SensorChart";
import SettingsPanel from "../components/SettingsPanel";
import { DEFAULT_SETTINGS } from "../components/sensorSettings";

export default function Home() {
  // 設定エリアで「設定を適用」またはテンプレ選択が実行されたときに反映される設定
  const [appliedSettings, setAppliedSettings] = useState(DEFAULT_SETTINGS);
  const { year, month, day, hour, minute, second } = appliedSettings.startDateTime;
  const startDateTime = new Date(year, month - 1, day, hour, minute, second);

  // テストフィールドの仮ノード座標（後から実測値に差し替え可能）
  // charts: 各ノードに付いている3つのセンサのグラフ表示位置（仮）
  const nodes = [
    {
      node_id: "0002",
      label: "ノードA",
      top: "20%",
      left: "80%",
      charts: [
        { top: "30%", left: "66%" },
        { top: "24%", left: "96%" },
        { top: "8%", left: "72%" },
      ],
    },
    {
      node_id: "0003",
      label: "ノードB",
      top: "80%",
      left: "80%",
      charts: [
        { top: "70%", left: "66%" },
        { top: "92%", left: "72%" },
        { top: "74%", left: "96%" },
      ],
    },
    {
      node_id: "0004",
      label: "ノードC",
      top: "80%",
      left: "20%",
      charts: [
        { top: "70%", left: "34%" },
        { top: "74%", left: "4%" },
        { top: "92%", left: "30%" },
      ],
    },
    {
      node_id: "0005",
      label: "ノードD",
      top: "20%",
      left: "20%",
      charts: [
        { top: "30%", left: "34%" },
        { top: "8%", left: "28%" },
        { top: "24%", left: "4%" },
      ],
    },
  ];

  return (
    <div className={styles.page}>
      <h2>テストフィールド - 行動経路表示</h2>

      <SettingsPanel onApply={setAppliedSettings} />

      {/* 地図エリア：後からLeafletに差し替える四角いプレースホルダー（狭い画面では横スクロール） */}
      <div className={styles.mapScroll}>
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
          node.charts.map((pos, i) =>
            appliedSettings.chartsVisible ? (
              <SensorChart
                key={`${node.node_id}-${i}`}
                label={`Sensor A${i + 1}`}
                top={pos.top}
                left={pos.left}
                valueUnit={appliedSettings.valueUnit}
                timeRangeSeconds={appliedSettings.timeRangeSeconds}
                timeAxisMode={appliedSettings.timeAxisMode}
                startDateTime={startDateTime}
              />
            ) : null
          )
        )}
      </div>
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
