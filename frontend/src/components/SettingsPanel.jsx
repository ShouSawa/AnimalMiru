import { useState } from "react";
import styles from "./SettingsPanel.module.css";
import {
  TIME_RANGE_OPTIONS,
  TIME_AXIS_MODE_OPTIONS,
  VALUE_UNIT_OPTIONS,
  DEFAULT_SETTINGS,
} from "./sensorSettings";
import ClockPicker from "./ClockPicker";

const TEMPLATES_STORAGE_KEY = "animalMiru.sensorChartTemplates";

const pad2 = (v) => String(v).padStart(2, "0");

function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function SettingsPanel({ onApply }) {
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [applied, setApplied] = useState(DEFAULT_SETTINGS);
  const [templates, setTemplates] = useState(loadTemplates);
  const [templateName, setTemplateName] = useState("");

  const applySettings = (settings) => {
    setApplied(settings);
    onApply(settings);
  };

  // 日時以外の項目は即座に反映する（未適用の日時は反映中の値のまま）
  const applyField = (fields) => {
    setDraft((prev) => ({ ...prev, ...fields }));
    applySettings({ ...applied, ...fields });
  };

  const toggleCharts = () => {
    applyField({ chartsVisible: !draft.chartsVisible });
  };

  const updateStart = (fields) => {
    setDraft((prev) => ({ ...prev, startDateTime: { ...prev.startDateTime, ...fields } }));
  };

  // <input type="date"> の値は "YYYY-MM-DD" 形式（未入力時は空文字）
  const handleDateChange = (e) => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    updateStart({ year: y, month: m, day: d });
  };

  const handleApply = () => {
    applySettings({ ...applied, startDateTime: draft.startDateTime });
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    const nextTemplates = [...templates, { name, settings: draft }];
    setTemplates(nextTemplates);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(nextTemplates));
    setTemplateName("");
  };

  const handleLoadTemplate = (e) => {
    const idx = e.target.value;
    e.target.value = "";
    if (idx === "") return;
    const template = templates[Number(idx)];
    if (!template) return;
    // 古い形式で保存されたテンプレートに項目が足りない場合はデフォルト値で補完する
    const settings = { ...DEFAULT_SETTINGS, ...template.settings };
    setDraft(settings);
    applySettings(settings);
  };

  const { year, month, day, hour, minute, second } = draft.startDateTime;
  const startPending = JSON.stringify(draft.startDateTime) !== JSON.stringify(applied.startDateTime);

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>設定エリア</div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>グラフ表示</div>
        <div className={styles.toggleRow}>
          <span>表示</span>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={draft.chartsVisible}
              onChange={toggleCharts}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.fieldLabel}>
          時間の範囲
          <select
            className={styles.select}
            value={draft.timeRangeSeconds}
            onChange={(e) => applyField({ timeRangeSeconds: Number(e.target.value) })}
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.section}>
        <label className={styles.fieldLabel}>
          横軸の表示
          <select
            className={styles.select}
            value={draft.timeAxisMode}
            onChange={(e) => applyField({ timeAxisMode: e.target.value })}
          >
            {TIME_AXIS_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.section}>
        <label className={styles.fieldLabel}>
          縦軸の表示
          <select
            className={styles.select}
            value={draft.valueUnit}
            onChange={(e) => applyField({ valueUnit: e.target.value })}
          >
            {VALUE_UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.section}>
        <div className={styles.fieldLabel}>表示開始時間</div>
        <div className={styles.dateRow}>
          <input
            type="date"
            className={styles.select}
            value={`${year}-${pad2(month)}-${pad2(day)}`}
            onChange={handleDateChange}
            // アイコン以外の部分をクリックしてもカレンダーを開く
            onClick={(e) => e.currentTarget.showPicker?.()}
          />
          <ClockPicker hour={hour} minute={minute} second={second} onChange={updateStart} />
        </div>
      </div>

      <div className={styles.section}>
        <button
          className={`${styles.applyButton} ${startPending ? styles.applyButtonPending : ""}`}
          onClick={handleApply}
        >
          選択した日時を適用
        </button>
      </div>

      <div className={styles.templateSection}>
        <input
          type="text"
          className={styles.templateInput}
          placeholder="テンプレ名"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <button className={styles.saveButton} onClick={handleSaveTemplate}>
          テンプレ保存
        </button>
        <select className={styles.select} defaultValue="" onChange={handleLoadTemplate}>
          <option value="">テンプレを選択…</option>
          {templates.map((t, i) => (
            <option key={i} value={i}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
