// 過去データの確認用: 窓の開始が ts（UNIX秒の整数）の推定結果を1件取得する。
// サーバーに保存がなければ、サーバーが ts の少し前から再計算して保存する。反応なし（保存対象でない秒）は null
export async function fetchPastFrame(ts) {
  const res = await fetch(`/api/estimation/recalc?ts=${ts}`, { method: "POST" });
  if (!res.ok) throw new Error(`/api/estimation/recalc: ${res.status}`);
  return (await res.json()).frames[0] ?? null;
}

// ts が [from, to)（UNIX秒の整数）の推定結果を ts の昇順で取得する
export async function fetchFrames(from, to, withMap = true) {
  const res = await fetch(`/api/estimation?from=${from}&to=${to}&map=${withMap ? 1 : 0}`);
  if (!res.ok) throw new Error(`/api/estimation: ${res.status}`);
  return (await res.json()).frames;
}

// 範囲経路計算: ts が [from, to)（UNIX秒の整数）の各秒の推定結果を計算して保存する。
// 既に保存のある秒はサーバーが再保存せず、保存済みの結果を使う
export async function recalcRange(from, to) {
  const res = await fetch(`/api/estimation/recalc-range?from=${from}&to=${to}`, { method: "POST" });
  if (!res.ok) throw new Error(`/api/estimation/recalc-range: ${res.status}`);
}

// 計算済みの ts（UNIX秒の整数）の推定結果を1件取得する（再計算はしない。反応なしなら null）
export async function fetchSavedFrame(ts) {
  return (await fetchFrames(ts, ts + 1))[0] ?? null;
}
