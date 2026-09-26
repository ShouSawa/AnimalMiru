import { useEffect, useState } from "react";
import styles from "./SettingsPanel.module.css";
import {
  TIME_RANGE_OPTIONS,
  TIME_AXIS_MODE_OPTIONS,
  VALUE_UNIT_OPTIONS,
  DEFAULT_SETTINGS,
} from "./sensorSettings";
import ClockPicker from "./ClockPicker";
import CalendarPicker from "./CalendarPicker";

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
  // カレンダー・時計で色付けする、データが存在する日付と時刻（選択中の日の0時からの秒数）
  const [dataDates, setDataDates] = useState([]);
  const [dataSeconds, setDataSeconds] = useState([]);

  const { year, month, day, hour, minute, second } = draft.startDateTime;
  const dateKey = `${year}-${pad2(month)}-${pad2(day)}`;

  useEffect(() => {
    fetch("/api/sensor-data/availability")
      .then((res) => res.json())
      .then((data) => setDataDates(data.dates ?? []))
      .catch((err) => console.error("データ日付一覧取得失敗:", err));
  }, []);

  useEffect(() => {
    // 日付を続けて切り替えたときに、古い日付の応答で上書きしないようにする
    let ignore = false;
    fetch(`/api/sensor-data/availability?date=${dateKey}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setDataSeconds(data.seconds ?? []);
      })
      .catch((err) => console.error("データ時刻一覧取得失敗:", err));
    return () => {
      ignore = true;
    };
  }, [dateKey]);

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
          <CalendarPicker
            year={year}
            month={month}
            day={day}
            dataDates={dataDates}
            onChange={updateStart}
          />
          <ClockPicker
            hour={hour}
            minute={minute}
            second={second}
            dataSeconds={dataSeconds}
            onChange={updateStart}
          />
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
