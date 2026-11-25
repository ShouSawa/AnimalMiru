import { useEffect, useState } from "react";
import { fetchFrames } from "./api";

// range（{ from, to }: UNIX秒の整数）の計算済みの推定結果を ts の昇順で返す。range が null のときは空配列
export default function useRangeFrames(range) {
  const [frames, setFrames] = useState([]);
  const from = range?.from;
  const to = range?.to;

  useEffect(() => {
    if (from === undefined) return;
    // 範囲を素早く切り替えたとき、古いリクエストの結果で上書きしないようにする
    let ignore = false;
    fetchFrames(from, to)
      .then((f) => {
        if (!ignore) setFrames(f);
      })
      .catch((err) => console.error("経路用の推定結果の取得失敗:", err));
    return () => {
      ignore = true;
    };
  }, [from, to]);

  return from === undefined ? [] : frames;
}
