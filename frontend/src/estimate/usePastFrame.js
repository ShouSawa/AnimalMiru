import { useEffect, useState } from "react";
import { fetchPastFrame } from "./api";

// 過去データの確認用: 窓の開始が ts（UNIX秒の整数）のフレームを1件取得する（反応なしなら null）。
// 保存がなければサーバーが再計算するので、ts が変わったとき（日時の適用・テンプレ選択）にだけ取得する
export default function usePastFrame({ enabled, ts }) {
  const [result, setResult] = useState({ ts: null, frame: null });

  useEffect(() => {
    if (!enabled) return;
    // 開始時間を素早く切り替えたとき、古いリクエストの結果で上書きしないようにする
    let ignore = false;
    fetchPastFrame(ts)
      .then((frame) => {
        if (!ignore) setResult({ ts, frame });
      })
      .catch((err) => console.error("推定結果の取得失敗:", err));
    return () => {
      ignore = true;
    };
  }, [enabled, ts]);

  return enabled && result.ts === ts ? result.frame : null;
}
