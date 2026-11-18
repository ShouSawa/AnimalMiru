import { useEffect, useState } from "react";
import { fetchFrames } from "./api";

// 過去データの確認用: 窓の開始が ts（UNIX秒の整数）のフレームを1件取得する（保存がなければ null）
export default function usePastFrame({ enabled, ts }) {
  const [result, setResult] = useState({ ts: null, frame: null });

  useEffect(() => {
    if (!enabled) return;
    // 開始時間を素早く切り替えたとき、古いリクエストの結果で上書きしないようにする
    let ignore = false;
    fetchFrames(ts, ts + 1)
      .then((frames) => {
        if (!ignore) setResult({ ts, frame: frames[0] ?? null });
      })
      .catch((err) => console.error("推定結果の取得失敗:", err));
    return () => {
      ignore = true;
    };
  }, [enabled, ts]);

  return enabled && result.ts === ts ? result.frame : null;
}
