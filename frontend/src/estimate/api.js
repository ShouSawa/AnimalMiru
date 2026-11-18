// ts が [from, to)（UNIX秒の整数）の推定結果を ts の昇順で取得する
export async function fetchFrames(from, to, withMap = true) {
  const res = await fetch(`/api/estimation?from=${from}&to=${to}&map=${withMap ? 1 : 0}`);
  if (!res.ok) throw new Error(`/api/estimation: ${res.status}`);
  return (await res.json()).frames;
}
