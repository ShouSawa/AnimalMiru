import { useEffect, useState } from "react";
import { fetchPastFrame } from "./api";

// 過去データの確認用: 窓の開始が ts（UNIX秒の整数）のフレームを fetchFrame で1件取得する（反応なしなら null）。
// 既定の fetchPastFrame は保存がなければサーバーが再計算するので、ts が変わったとき（日時の適用・テンプレ選択）にだけ取得する。
// 取得中は直前のフレームを返し続ける（スライダーを動かしたときに地図がちらつかないようにする）
export default function usePastFrame({ enabled, ts, fetchFrame = fetchPastFrame }) {
  const [frame, setFrame] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    // ts を素早く切り替えたとき、古いリクエストの結果で上書きしないようにする
    let ignore = false;
    fetchFrame(ts)
      .then((f) => {
        if (!ignore) setFrame(f);
      })
      .catch((err) => console.error("推定結果の取得失敗:", err));
    return () => {
      ignore = true;
    };
  }, [enabled, ts, fetchFrame]);

  return enabled ? frame : null;
}
