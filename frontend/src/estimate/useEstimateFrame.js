import usePastFrame from "./usePastFrame";
import useRealtimeFrame from "./useRealtimeFrame";

// 地図に表示する推定フレームを返す（なければ null）。
// リアルタイムはグラフの右端 edgeSec に合わせ、過去確認は開始時間（整数秒）の窓を使う
export default function useEstimateFrame({ enabled, realtime, pastFromSec, edgeSec }) {
  const past = usePastFrame({ enabled: enabled && !realtime, ts: Math.floor(pastFromSec) });
  const live = useRealtimeFrame({ enabled: enabled && realtime, edgeSec });
  return realtime ? live : past;
}
