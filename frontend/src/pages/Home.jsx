import { useEffect, useState } from "react";
import styles from "./Home.module.css";
import SensorChart from "../components/SensorChart";
import SettingsPanel from "../components/SettingsPanel";
import MapGrid from "../components/MapGrid";
import SensorRanges from "../components/SensorRanges";
import { loadSettings } from "../components/sensorSettings";

const SENSOR_IDS = ["A1", "A2", "A3"];

// 経路表示モードのときはノードとグラフを専用の位置（routeTop, routeLeft）に置く
const placeOf = (item, routeMode) =>
  routeMode ? { top: item.routeTop, left: item.routeLeft } : { top: item.top, left: item.left };

// センサ範囲の色分け用。色相が違う12色でセンサを見分ける
const hueColor = (hue) => `hsl(${hue} 100% 40%)`;

// リアルタイムモード: 送信・保存にかかる時間を見込み、グラフの右端を現在時刻より遅らせる秒数
const REALTIME_DELAY_SECONDS = 3;
const REALTIME_TICK_MS = 200; // グラフを進める間隔
const SAMPLE_INTERVAL_SEC = 0.035; // 1行に並んだ値どうしの測定間隔（Arduinoの記録間隔。バックエンドの sampleIntervalSec と同じ）

// サーバーとブラウザの時計のずれ（ミリ秒）。WebSocketで最初のデータが届くまでは null
let clockOffsetMs = null;
// サーバーの時計に合わせた現在時刻（ミリ秒）。データの時刻はサーバーの受信時刻なので、こちらを基準に表示範囲を決める
const serverNowMs = () => Date.now() + (clockOffsetMs ?? 0);

// WebSocketで届いた sensor_data（payload_hex は A1,A2,A3 の順に3値ずつ並んだ16進数）を
// ノード→センサ→[[UNIX秒, 値(0〜255)], ...] に変換する
function parseSensorData(entries) {
  const series = {};
  for (const { node_id, timestamp, payload_hex } of entries) {
    const values = payload_hex.split(",");
    for (let i = 0; i + 2 < values.length; i += 3) {
      SENSOR_IDS.forEach((sensorId, j) => {
        const v = parseInt(values[i + j], 16);
        if (Number.isNaN(v)) return;
        ((series[node_id] ??= {})[sensorId] ??= []).push([timestamp + (i / 3) * SAMPLE_INTERVAL_SEC, v]);
      });
    }
  }
  return series;
}

// 手元のデータのうち [from, to) を取得し直した分で置き換え、keepFrom より古い点は捨てる
function mergeSeries(prev, fetched, from, to, keepFrom) {
  const merged = {};
  for (const nodeId of new Set([...Object.keys(prev), ...Object.keys(fetched)])) {
    for (const sensorId of SENSOR_IDS) {
      const old = prev[nodeId]?.[sensorId] ?? [];
      const points = [
        ...old.filter(([t]) => t >= keepFrom && t < from),
        ...(fetched[nodeId]?.[sensorId] ?? []),
        ...old.filter(([t]) => t >= to),
      ];
      if (points.length) (merged[nodeId] ??= {})[sensorId] = points;
    }
  }
  return merged;
}

// [[UNIX秒, 値(0〜255)], ...] の最大・最小を電圧[V]で返す（データがなければ null）
// 点数が多いと Math.max(...values) はスタックあふれを起こすため、1点ずつ比較する
function voltageRange(points) {
  if (!points?.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const [, v] of points) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min: (min / 255) * 5, max: (max / 255) * 5 };
}

export default function Home() {
  // 設定エリアで「設定を適用」またはテンプレ選択が実行されたときに反映される設定
  const [appliedSettings, setAppliedSettings] = useState(loadSettings);
  const { year, month, day, hour, minute, second } = appliedSettings.startDateTime;
  const { realtime, timeRangeSeconds, routeMode, sensorRangeVisible } = appliedSettings;
  const pastFromSec = new Date(year, month - 1, day, hour, minute, second).getTime() / 1000;
  // リアルタイムモードで時計の進みに合わせて更新する現在時刻（ミリ秒）
  const [nowMs, setNowMs] = useState(() => Date.now());
  // グラフの表示範囲。リアルタイムモードでは右端を「現在時刻 − 遅延秒数」にする
  const toSec = realtime ? nowMs / 1000 - REALTIME_DELAY_SECONDS : pastFromSec + timeRangeSeconds;
  const fromSec = toSec - timeRangeSeconds;
  const startDateTime = new Date(fromSec * 1000);
  // ノード→センサ→[[UNIX秒, 値(0〜255)], ...]
  const [series, setSeries] = useState({});

  // 過去データの確認: 適用した期間のデータを取得する
  useEffect(() => {
    if (realtime) return;
    // 期間を素早く切り替えたとき、古いリクエストの結果で上書きしないようにする
    let ignore = false;
    fetch(`/api/sensor-data/series?from=${pastFromSec}&to=${pastFromSec + timeRangeSeconds}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setSeries(data.series ?? {});
      })
      .catch((err) => console.error("グラフ用データ取得失敗:", err));
    return () => {
      ignore = true;
    };
  }, [realtime, pastFromSec, timeRangeSeconds]);

  // リアルタイムモード: データの到着とは関係なく、現実の時間の進みに合わせてグラフを進める
  useEffect(() => {
    if (!realtime) return;
    const id = setInterval(() => setNowMs(serverNowMs()), REALTIME_TICK_MS);
    return () => clearInterval(id);
  }, [realtime]);

  // リアルタイムモード: 表示範囲の過去分をDBから1回だけ取得し、以降の新着はWebSocketで受け取って追加する
  useEffect(() => {
    if (!realtime) return;
    let ignore = false;
    const keepFrom = () => Math.floor(serverNowMs() / 1000 - REALTIME_DELAY_SECONDS - timeRangeSeconds) - 1;

    // APIは整数秒で指定する。to 以降の点はWebSocketで届いた分をそのまま残す
    const from = keepFrom();
    const to = Math.floor(serverNowMs() / 1000);
    fetch(`/api/sensor-data/series?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setSeries((prev) => mergeSeries(prev, data.series ?? {}, from, to, keepFrom()));
      })
      .catch((err) => console.error("リアルタイムデータ取得失敗:", err));

    // DB画面と同じく、サーバーがDBへ保存した直後に配信するデータを受け取る（Nginx経由）
    const ws = new WebSocket(`ws://${window.location.host}/ws/realtime`);
    ws.onmessage = (event) => {
      const entries = JSON.parse(event.data).sensor_data ?? [];
      // 「データの時刻 − 受信した時刻」の最大値（通信の遅れが最も小さいとき）を時計のずれとみなす
      for (const { timestamp } of entries) {
        const offset = timestamp * 1000 - Date.now();
        if (clockOffsetMs === null || offset > clockOffsetMs) clockOffsetMs = offset;
      }
      // [from, to) を Infinity にすると、手元のデータを残したまま末尾に追加する
      setSeries((prev) => mergeSeries(prev, parseSensorData(entries), Infinity, Infinity, keepFrom()));
    };
    return () => {
      ignore = true;
      ws.close();
    };
  }, [realtime, timeRangeSeconds]);

  // グラフとデータ解析エリアには、表示範囲内の点だけを渡す
  const visibleSeries = {};
  for (const [nodeId, sensors] of Object.entries(series)) {
    visibleSeries[nodeId] = {};
    for (const [sensorId, points] of Object.entries(sensors)) {
      visibleSeries[nodeId][sensorId] = points.filter(([t]) => t >= fromSec && t <= toSec);
    }
  }

  // テストフィールドの仮ノード座標（後から実測値に差し替え可能）
  // routeTop, routeLeft: 経路表示モードでの位置（ノードは±5m、グラフは地図の外周）
  // charts: 各ノードに付いている3つのセンサのグラフ表示位置（仮）
  //   angle: センサの向き（東を0°とした反時計回り）、hue: センサ範囲とグラフの色相
  const nodes = [
    {
      node_id: "0002",
      label: "ノードA",
      top: "20%",
      left: "80%",
      routeTop: "33.33%",
      routeLeft: "66.67%",
      charts: [
        { top: "30%", left: "66%", routeTop: "-13%", routeLeft: "118%", angle: 225, hue: 0 },
        { top: "24%", left: "96%", routeTop: "6%", routeLeft: "118%", angle: 345, hue: 330 },
        { top: "8%", left: "72%", routeTop: "-13%", routeLeft: "91%", angle: 105, hue: 300 },
      ],
    },
    {
      node_id: "0003",
      label: "ノードB",
      top: "80%",
      left: "80%",
      routeTop: "66.67%",
      routeLeft: "66.67%",
      charts: [
        { top: "70%", left: "66%", routeTop: "113%", routeLeft: "118%", angle: 135, hue: 30 },
        { top: "92%", left: "72%", routeTop: "113%", routeLeft: "91%", angle: 255, hue: 90 },
        { top: "74%", left: "96%", routeTop: "94%", routeLeft: "118%", angle: 15, hue: 60 },
      ],
    },
    {
      node_id: "0004",
      label: "ノードC",
      top: "80%",
      left: "20%",
      routeTop: "66.67%",
      routeLeft: "33.33%",
      charts: [
        { top: "70%", left: "34%", routeTop: "113%", routeLeft: "-18%", angle: 45, hue: 180 },
        { top: "74%", left: "4%", routeTop: "94%", routeLeft: "-18%", angle: 165, hue: 120 },
        { top: "92%", left: "30%", routeTop: "113%", routeLeft: "9%", angle: 285, hue: 150 },
      ],
    },
    {
      node_id: "0005",
      label: "ノードD",
      top: "20%",
      left: "20%",
      routeTop: "33.33%",
      routeLeft: "33.33%",
      charts: [
        { top: "30%", left: "34%", routeTop: "-13%", routeLeft: "-18%", angle: 315, hue: 210 },
        { top: "8%", left: "28%", routeTop: "-13%", routeLeft: "9%", angle: 75, hue: 270 },
        { top: "24%", left: "4%", routeTop: "6%", routeLeft: "-18%", angle: 195, hue: 240 },
      ],
    },
  ];

  return (
    <div className={styles.page}>
      <h2>テストフィールド - 行動経路表示</h2>

      <SettingsPanel onApply={setAppliedSettings} />

      {/* 地図エリア：後からLeafletに差し替える四角いプレースホルダー（狭い画面では横スクロール） */}
      <div className={`${styles.mapScroll} ${routeMode ? styles.mapScrollRoute : ""}`}>
      <div className={styles.mapArea}>

        {/* 仮ラベル（Leaflet導入後に削除） */}
        <span className={styles.mapLabel}>
          ※ この領域は後からLeaflet地図に差し替えます
        </span>

        {routeMode && <MapGrid />}

        {sensorRangeVisible && (
          <SensorRanges
            sectors={nodes.flatMap((node) =>
              node.charts.map((chart) => ({
                ...placeOf(node, routeMode),
                angle: chart.angle,
                color: hueColor(chart.hue),
              }))
            )}
          />
        )}

        {/* センサノードのピン */}
        {nodes.map((node) => (
          <div
            key={node.node_id}
            className={styles.nodePin}
            style={{ "--top": placeOf(node, routeMode).top, "--left": placeOf(node, routeMode).left }}
          >
            <img className={styles.nodePinImage} src={`/Sensornode${node.node_id}.png`} alt={node.node_id} />
            <span className={styles.nodePinLabel}>{node.node_id}</span>
          </div>
        ))}

        {/* 各センサ値グラフ */}
        {nodes.map((node) =>
          node.charts.map((chart, i) =>
            appliedSettings.chartsVisible ? (
              <SensorChart
                key={`${node.node_id}-${i}`}
                label={`Sensor ${SENSOR_IDS[i]}`}
                color={sensorRangeVisible ? hueColor(chart.hue) : undefined}
                top={placeOf(chart, routeMode).top}
                left={placeOf(chart, routeMode).left}
                points={visibleSeries[node.node_id]?.[SENSOR_IDS[i]]}
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

      {/* データ解析エリア：グラフ表示期間内の各センサの最大・最小電圧 */}
      <div className={styles.analysisArea}>
        <div className={styles.analysisTitle}>データ解析エリア</div>
        <div className={styles.nodeList}>
          {nodes.map((node) => (
            <div key={node.node_id} className={styles.nodeCard}>
              <div className={styles.nodeCardLabel}>{node.label}</div>
              <div className={styles.nodeCardId}>{node.node_id}</div>
              <div className={styles.sensorCards}>
                {SENSOR_IDS.map((sensorId) => {
                  const range = voltageRange(visibleSeries[node.node_id]?.[sensorId]);
                  return (
                    <div key={sensorId} className={styles.sensorCard}>
                      <div className={styles.sensorCardTitle}>Sensor {sensorId}</div>
                      <div className={styles.statRow}>
                        <span>最大</span>
                        <span>{range ? `${range.max.toFixed(2)} V` : "−"}</span>
                      </div>
                      <div className={styles.statRow}>
                        <span>最小</span>
                        <span>{range ? `${range.min.toFixed(2)} V` : "−"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
