import styles from "../components/SettingsPanel.module.css";
import ownStyles from "./EnvSettings.module.css";
import CalendarPicker from "../components/CalendarPicker";
import ClockPicker from "../components/ClockPicker";
import TimeInput from "./TimeInput";
import { TARGETS, toDate } from "./waypoints";

// lastSec: 通過点エリアの最後の通過時間（秒）。記録終了時間は記録開始時間にこれを足した時刻で、入力はできない
export default function EnvSettings({ settings, lastSec, onChange, onRecord, recordDisabled }) {
  const { title, start, target, memo, intervalSec } = settings;
  const end = new Date(toDate(start).getTime() + lastSec * 1000);
  const updateStart = (fields) => onChange({ start: { ...start, ...fields } });

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>環境設定エリア</div>

      <label className={styles.fieldLabel}>
        タイトル
        <input
          type="text"
          className={ownStyles.input}
          value={title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>

      <div className={styles.section}>
        <div className={styles.fieldLabel}>記録開始時間</div>
        <div className={styles.dateRow}>
          <CalendarPicker year={start.year} month={start.month} day={start.day} onChange={updateStart} />
          <ClockPicker hour={start.hour} minute={start.minute} second={start.second} onChange={updateStart} />
        </div>

        <div className={`${styles.fieldLabel} ${styles.endLabel}`}>記録終了時間</div>
        <div className={styles.dateRow}>
          <CalendarPicker year={end.getFullYear()} month={end.getMonth() + 1} day={end.getDate()} disabled />
          <ClockPicker hour={end.getHours()} minute={end.getMinutes()} second={end.getSeconds()} disabled />
        </div>
      </div>

      <label className={styles.fieldLabel}>
        実験対象
        <select className={styles.select} value={target} onChange={(e) => onChange({ target: e.target.value })}>
          {TARGETS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.fieldLabel}>
        メモ
        <textarea
          className={ownStyles.memo}
          value={memo}
          onChange={(e) => onChange({ memo: e.target.value })}
        />
      </label>

      <div className={styles.section}>
        <div className={styles.fieldLabel}>セル通過間隔</div>
        <TimeInput sec={intervalSec} onChange={(sec) => onChange({ intervalSec: sec })} />
        <button type="button" className={ownStyles.recordButton} disabled={recordDisabled} onClick={onRecord}>
          記録
        </button>
      </div>
    </div>
  );
}
