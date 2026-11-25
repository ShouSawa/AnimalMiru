import { useState } from "react";
import styles from "./TimeInput.module.css";
import { formatMmSs, parseMmSs } from "./waypoints";

// 分:秒（00:00）の入力欄。入力中は文字列のまま持ち、フォーカスを外したとき（Enterも同じ）に正しい形式なら確定する
export default function TimeInput({ sec, onChange }) {
  const [draft, setDraft] = useState(null);

  const commit = () => {
    const value = parseMmSs(draft ?? "");
    if (value !== null) onChange(value);
    setDraft(null);
  };

  return (
    <input
      type="text"
      className={styles.input}
      value={draft ?? formatMmSs(sec)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
