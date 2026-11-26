export const TARGETS = ["人", "シカ", "サル", "イノシシ"];

// 設定の開始日時 { year, month, day, hour, minute, second } を Date にする
export const toDate = ({ year, month, day, hour, minute, second }) =>
  new Date(year, month - 1, day, hour, minute, second);

const RAINBOW_STEPS = 30;

// 通過順（0始まり）に対応する虹色。30段階で一周し、31番目からは最初の色に戻る
export const rainbowColor = (index) => `hsl(${(index % RAINBOW_STEPS) * (360 / RAINBOW_STEPS)} 100% 50%)`;

const pad2 = (v) => String(v).padStart(2, "0");

// 秒数を「分:秒」（00:04 など）にする
export const formatMmSs = (sec) => `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;

// 「分:秒」を秒数にする（形式が違うときは null）
export function parseMmSs(text) {
  const m = /^(\d+):([0-5]\d)$/.exec(text.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
