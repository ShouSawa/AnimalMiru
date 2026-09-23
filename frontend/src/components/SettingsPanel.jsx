import { useState } from "react";
import styles from "./SettingsPanel.module.css";
import { TIME_RANGE_OPTIONS, VALUE_UNIT_OPTIONS, DEFAULT_SETTINGS } from "./sensorSettings";

const TEMPLATES_STORAGE_KEY = "animalMiru.sensorChartTemplates";

const YEARS = Array.from({ length: 11 }, (_, i) => 2020 + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_OR_SECONDS = Array.from({ length: 60 }, (_, i) => i);

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

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
  const [templates, setTemplates] = useState(loadTemplates);
  const [templateName, setTemplateName] = useState("");

  // 表示ON/OFFは「設定を適用」を待たず即座に反映する
  const toggleCharts = () => {
    const next = { ...draft, chartsVisible: !draft.chartsVisible };
    setDraft(next);
    onApply(next);
  };

  const updateStartField = (field, rawValue) => {
    const value = Number(rawValue);
    setDraft((prev) => {
      const nextStart = { ...prev.startDateTime, [field]: value };
      const maxDay = daysInMonth(nextStart.year, nextStart.month);
      if (nextStart.day > maxDay) nextStart.day = maxDay;
      return { ...prev, startDateTime: nextStart };
    });
  };

  const handleApply = () => {
    onApply(draft);
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
    onApply(settings);
  };

  const { year, month, day, hour, minute, second } = draft.startDateTime;

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
          横軸（時間）の範囲
          <select
            className={styles.select}
            value={draft.timeRangeSeconds}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, timeRangeSeconds: Number(e.target.value) }))
            }
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
        <div className={styles.fieldLabel}>表示開始時間</div>
        <div className={styles.dateRow}>
          <select
            className={styles.select}
            value={year}
            onChange={(e) => updateStartField("year", e.target.value)}
          >
            {YEARS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          年
          <select
            className={styles.select}
            value={month}
            onChange={(e) => updateStartField("month", e.target.value)}
          >
            {MONTHS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          月
          <select
            className={styles.select}
            value={day}
            onChange={(e) => updateStartField("day", e.target.value)}
          >
            {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          日
          <select
            className={styles.select}
            value={hour}
            onChange={(e) => updateStartField("hour", e.target.value)}
          >
            {HOURS.map((v) => (
              <option key={v} value={v}>
                {String(v).padStart(2, "0")}
              </option>
            ))}
          </select>
          時
          <select
            className={styles.select}
            value={minute}
            onChange={(e) => updateStartField("minute", e.target.value)}
          >
            {MINUTES_OR_SECONDS.map((v) => (
              <option key={v} value={v}>
                {String(v).padStart(2, "0")}
              </option>
            ))}
          </select>
          分
          <select
            className={styles.select}
            value={second}
            onChange={(e) => updateStartField("second", e.target.value)}
          >
            {MINUTES_OR_SECONDS.map((v) => (
              <option key={v} value={v}>
                {String(v).padStart(2, "0")}
              </option>
            ))}
          </select>
          秒
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.fieldLabel}>
          縦軸の表示
          <select
            className={styles.select}
            value={draft.valueUnit}
            onChange={(e) => setDraft((prev) => ({ ...prev, valueUnit: e.target.value }))}
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
        <button className={styles.applyButton} onClick={handleApply}>
          設定を適用
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
