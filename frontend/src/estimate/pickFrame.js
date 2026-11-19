// 窓の終わり（ts + windowSec）がグラフの右端 edgeSec 以前の、最新のフレームを返す（なければ null）
export function pickFrame(frames, edgeSec, windowSec = 1) {
  let picked = null;
  for (const f of frames) {
    if (f.ts + windowSec <= edgeSec && (!picked || f.ts > picked.ts)) picked = f;
  }
  return picked;
}
