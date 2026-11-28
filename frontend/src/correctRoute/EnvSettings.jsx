import styles from "../components/SettingsPanel.module.css";
import ownStyles from "./EnvSettings.module.css";
import TimeInput from "./TimeInput";
import RouteList from "./RouteList";
import { TARGETS } from "./waypoints";

export default function EnvSettings({ settings, onChange, onRecord, recordDisabled, onLoad, onClear }) {
  const { title, target, memo, intervalSec } = settings;

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

      <div className={styles.section}>
        <RouteList onSelect={onLoad} />
        <button
          type="button"
          className={ownStyles.clearButton}
          onClick={() => window.confirm("設定と通過点をすべて消して、空白の状態にしますか？") && onClear()}
        >
          経路削除
        </button>
      </div>
    </div>
  );
}
