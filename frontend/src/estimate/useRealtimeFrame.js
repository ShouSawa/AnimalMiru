import { useEffect, useState } from "react";
import { fetchFrames } from "./api";
import { pickFrame } from "./pickFrame";

const KEEP_SEC = 30; // これより古いフレームは捨てる

// リアルタイム用: 初回に直近のフレームを取得し、以降はWebSocketの estimation で追加する。
// グラフの右端 edgeSec に間に合っている最新のフレームを返す（なければ null）
export default function useRealtimeFrame({ enabled, edgeSec }) {
  const [frames, setFrames] = useState([]);

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    // ts の重複を除き、KEEP_SEC より古いものを捨てて ts の昇順に並べる
    const merge = (prev, added) => {
      const cut = Date.now() / 1000 - KEEP_SEC - 5;
      const byTs = new Map([...prev, ...added].map((f) => [f.ts, f]));
      return [...byTs.values()].filter((f) => f.ts >= cut).sort((a, b) => a.ts - b.ts);
    };

    const now = Math.floor(Date.now() / 1000);
    fetchFrames(now - KEEP_SEC - 10, now + 10)
      .then((fetched) => {
        if (!ignore) setFrames((prev) => merge(prev, fetched));
      })
      .catch((err) => console.error("推定結果の取得失敗:", err));

    const ws = new WebSocket(`ws://${window.location.host}/ws/realtime`);
    ws.onmessage = (event) => {
      const frame = JSON.parse(event.data).estimation;
      if (frame) setFrames((prev) => merge(prev, [frame]));
    };
    return () => {
      ignore = true;
      ws.close();
    };
  }, [enabled]);

  const frame = enabled ? pickFrame(frames, edgeSec) : null;
  return frame && frame.ts >= edgeSec - KEEP_SEC ? frame : null;
}
