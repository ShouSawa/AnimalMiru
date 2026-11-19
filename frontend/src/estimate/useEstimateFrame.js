import usePastFrame from "./usePastFrame";
import useRealtimeFrame from "./useRealtimeFrame";
import { fetchSavedFrame } from "./api";

// 地図に表示する推定フレームを返す（なければ null）。
// リアルタイムはグラフの右端 edgeSec に合わせ、過去確認は開始時間（整数秒）の窓を使う。
// 範囲経路計算のスライダー位置 rangeTs（UNIX秒の整数、なければ null）があるときは、その秒の計算済みの結果を使う
export default function useEstimateFrame({ enabled, realtime, pastFromSec, edgeSec, rangeTs }) {
  const inRange = rangeTs !== null;
  const past = usePastFrame({ enabled: enabled && !realtime && !inRange, ts: Math.floor(pastFromSec) });
  const range = usePastFrame({ enabled: enabled && !realtime && inRange, ts: rangeTs, fetchFrame: fetchSavedFrame });
  const live = useRealtimeFrame({ enabled: enabled && realtime, edgeSec });
  if (realtime) return live;
  return inRange ? range : past;
}
