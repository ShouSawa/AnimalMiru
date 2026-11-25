import { useEffect, useState } from "react";
import styles from "./SettingsPanel.module.css";
import {
  TIME_RANGE_OPTIONS,
  TIME_AXIS_MODE_OPTIONS,
  VALUE_UNIT_OPTIONS,
  formatDuration,
  loadSettings,
  saveSettings,
} from "./sensorSettings";
import ClockPicker from "./ClockPicker";
import CalendarPicker from "./CalendarPicker";
import { exportSensorCsv } from "./sensorCsv";
import { recalcRange } from "../estimate/api";

const pad2 = (v) => String(v).padStart(2, "0");
const formatTime = (sec) => new Date(sec * 1000).toLocaleTimeString("ja-JP", { hour12: false });
const toUnixSec = ({ year, month, day, hour, minute, second }) =>
  new Date(year, month - 1, day, hour, minute, second).getTime() / 1000;
const toDateTime = (sec) => {
  const d = new Date(sec * 1000);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  };
};

// 日付（YYYY-MM-DD）にデータがある時刻（その日の0時からの秒数）の一覧を取得する
function useDataSeconds(dateKey) {
  const [dataSeconds, setDataSeconds] = useState([]);
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
  return dataSeconds;
}

function ToggleSection({ title, checked, onChange }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.toggleRow}>
        <span>{checked ? "ON" : "OFF"}</span>
        <label className={styles.toggleSwitch}>
          <input type="checkbox" className={styles.toggleInput} checked={checked} onChange={onChange} />
          <span className={styles.toggleSlider} />
        </label>
      </div>
    </div>
  );
}

// estimateTs: 地図に表示中の推定位置の時刻（UNIX秒）。反応がなく表示するものがなければ null
// onRangeTs: 範囲経路計算のスライダー位置（UNIX秒）を伝える。計算済みの範囲がないときは null
// onRange: 範囲経路計算を終えた範囲 { from, to }（UNIX秒）を伝える。計算済みの範囲がないときは null
export default function SettingsPanel({ onApply, onRangeTs, onRange, estimateTs }) {
  const [draft, setDraft] = useState(loadSettings);
  const [applied, setApplied] = useState(loadSettings);
  const [templateNames, setTemplateNames] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  // カレンダー・時計で色付けする、データが存在する日付
  const [dataDates, setDataDates] = useState([]);
  const [csvExporting, setCsvExporting] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  // 範囲経路計算を終えた範囲（UNIX秒）とスライダーの位置
  const [calculated, setCalculated] = useState(null);
  const [sliderTs, setSliderTs] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [rangeMessage, setRangeMessage] = useState("");

  const { year, month, day, hour, minute, second } = draft.startDateTime;
  const dateKey = `${year}-${pad2(month)}-${pad2(day)}`;
  // 表示終了時間は、表示開始時間に時間の範囲を足した時刻
  const startSec = toUnixSec(draft.startDateTime);
  const endSec = startSec + draft.timeRangeSeconds;
  const endDateTime = toDateTime(endSec);
  const endDateKey = `${endDateTime.year}-${pad2(endDateTime.month)}-${pad2(endDateTime.day)}`;
  const dataSeconds = useDataSeconds(dateKey);
  const endDataSeconds = useDataSeconds(endDateKey);
  const rangeReady =
    !draft.realtime && calculated?.from === startSec && calculated?.to === endSec;
  // 時間の範囲の選択肢にない秒数（表示終了時間から決まった値）は、その値の項目を加えて表示する
  const rangeOptions = TIME_RANGE_OPTIONS.some((opt) => opt.value === draft.timeRangeSeconds)
    ? TIME_RANGE_OPTIONS
    : [...TIME_RANGE_OPTIONS, { value: draft.timeRangeSeconds, label: formatDuration(draft.timeRangeSeconds) }];

  const refreshTemplateNames = () =>
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => setTemplateNames(data.names ?? []))
      .catch((err) => console.error("テンプレ名一覧取得失敗:", err));

  useEffect(() => {
    refreshTemplateNames();
    fetch("/api/sensor-data/availability")
      .then((res) => res.json())
      .then((data) => setDataDates(data.dates ?? []))
      .catch((err) => console.error("データ日付一覧取得失敗:", err));
  }, []);

  // 範囲経路計算の済んでいる範囲のときだけ、スライダー位置を地図の推定位置に反映する
  useEffect(() => {
    onRangeTs(rangeReady ? sliderTs : null);
  }, [onRangeTs, rangeReady, sliderTs]);

  useEffect(() => {
    onRange(rangeReady ? { from: startSec, to: endSec } : null);
  }, [onRange, rangeReady, startSec, endSec]);

  const applySettings = (settings) => {
    setApplied(settings);
    saveSettings(settings);
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

  // 表示終了時間を変えたら、表示開始時間からの差を時間の範囲にする（開始より後のときだけ）。
  // 開始時間と同じく、「選択した日時を適用」を押すまで反映しない
  const updateEnd = (fields) => {
    const seconds = toUnixSec({ ...endDateTime, ...fields }) - startSec;
    if (seconds > 0) setDraft((prev) => ({ ...prev, timeRangeSeconds: seconds }));
  };

  const handleApply = () => {
    applySettings({ ...applied, startDateTime: draft.startDateTime, timeRangeSeconds: draft.timeRangeSeconds });
  };

  // 表示開始時間から表示終了時間までを1秒ごとに計算し、結果が地図に見えるよう位置表示をONにする
  const handleRangeCalc = async () => {
    setCalculating(true);
    setRangeMessage("");
    try {
      await recalcRange(startSec, endSec);
      applyField({
        startDateTime: draft.startDateTime,
        timeRangeSeconds: draft.timeRangeSeconds,
        positionVisible: true,
        routeMode: true,
      });
      setCalculated({ from: startSec, to: endSec });
      setSliderTs(startSec);
    } catch (err) {
      console.error("範囲経路計算失敗:", err);
      setRangeMessage("範囲経路計算に失敗しました");
    } finally {
      setCalculating(false);
    }
  };

  // 設定エリアに表示中の開始時間（「適用」前でも）から、時間の範囲の分を出力する
  const handleExportCsv = async () => {
    setCsvExporting(true);
    setCsvMessage("");
    try {
      const count = await exportSensorCsv(draft.startDateTime, draft.timeRangeSeconds);
      setCsvMessage(count > 0 ? `${count}件を出力しました` : "指定した期間のデータがありません");
    } catch (err) {
      console.error("CSV出力失敗:", err);
      setCsvMessage("CSV出力に失敗しました");
    } finally {
      setCsvExporting(false);
    }
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    setTemplateMessage("");
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          time_range: draft.timeRangeSeconds,
          horizontal_axis: draft.timeAxisMode,
          vertical_axis: draft.valueUnit,
          start_time: `${dateKey}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTemplateName("");
      setTemplateMessage(`「${name}」を保存しました`);
      refreshTemplateNames();
    } catch (err) {
      console.error("テンプレ保存失敗:", err);
      setTemplateMessage("テンプレの保存に失敗しました");
    }
  };

  const handleLoadTemplate = async (e) => {
    const name = e.target.value;
    e.target.value = "";
    if (name === "") return;
    setTemplateMessage("");
    try {
      const res = await fetch(`/api/templates?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const template = await res.json();
      // "YYYY-MM-DDTHH:MM:SS" を年月日・時分秒の数値に分解する
      const [y, mo, d, h, mi, s] = template.start_time.split(/[-T:]/).map(Number);
      applyField({
        timeRangeSeconds: template.time_range,
        timeAxisMode: template.horizontal_axis,
        valueUnit: template.vertical_axis,
        startDateTime: { year: y, month: mo, day: d, hour: h, minute: mi, second: s },
      });
    } catch (err) {
      console.error("テンプレ読み込み失敗:", err);
      setTemplateMessage("テンプレの読み込みに失敗しました");
    }
  };

  const startPending =
    JSON.stringify(draft.startDateTime) !== JSON.stringify(applied.startDateTime) ||
    draft.timeRangeSeconds !== applied.timeRangeSeconds;

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
        <div className={styles.sectionTitle}>リアルタイムモード</div>
        <div className={styles.toggleRow}>
          <span>{draft.realtime ? "ON" : "OFF"}</span>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={draft.realtime}
              onChange={() => applyField({ realtime: !draft.realtime })}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>

      <ToggleSection
        title="経路表示モード"
        checked={draft.routeMode}
        onChange={() => applyField({ routeMode: !draft.routeMode })}
      />

      <ToggleSection
        title="センサ範囲表示"
        checked={draft.sensorRangeVisible}
        onChange={() => applyField({ sensorRangeVisible: !draft.sensorRangeVisible })}
      />

      <div className={styles.section}>
        <label className={styles.fieldLabel}>
          時間の範囲
          <select
            className={styles.select}
            value={draft.timeRangeSeconds}
            onChange={(e) => applyField({ timeRangeSeconds: Number(e.target.value) })}
          >
            {rangeOptions.map((opt) => (
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
            disabled={draft.realtime}
            onChange={updateStart}
          />
          <ClockPicker
            hour={hour}
            minute={minute}
            second={second}
            dataSeconds={dataSeconds}
            disabled={draft.realtime}
            onChange={updateStart}
          />
        </div>

        <div className={`${styles.fieldLabel} ${styles.endLabel}`}>表示終了時間</div>
        <div className={styles.dateRow}>
          <CalendarPicker
            year={endDateTime.year}
            month={endDateTime.month}
            day={endDateTime.day}
            dataDates={dataDates}
            disabled={draft.realtime}
            onChange={updateEnd}
          />
          <ClockPicker
            hour={endDateTime.hour}
            minute={endDateTime.minute}
            second={endDateTime.second}
            dataSeconds={endDataSeconds}
            disabled={draft.realtime}
            onChange={updateEnd}
          />
          <button
            className={styles.saveButton}
            disabled={draft.realtime || calculating}
            onClick={handleRangeCalc}
          >
            範囲経路計算
          </button>
        </div>
        {calculating && <div className={styles.csvMessage}>計算中…</div>}
        {rangeMessage && <div className={styles.csvMessage}>{rangeMessage}</div>}
      </div>

      <div className={styles.section}>
        <button
          className={`${styles.applyButton} ${startPending ? styles.applyButtonPending : ""}`}
          disabled={draft.realtime}
          onClick={handleApply}
        >
          選択した日時を適用
        </button>
      </div>

      <div className={styles.section}>
        <button
          className={styles.saveButton}
          disabled={draft.realtime || csvExporting}
          onClick={handleExportCsv}
        >
          csvに出力
        </button>
        {csvMessage && <div className={styles.csvMessage}>{csvMessage}</div>}
      </div>

      {/* 位置は経路表示モードの地図に重ねるため、ONにしたときは経路表示モードも ON にする */}
      <ToggleSection
        title="位置表示"
        checked={draft.positionVisible}
        onChange={() =>
          applyField(draft.positionVisible ? { positionVisible: false } : { positionVisible: true, routeMode: true })
        }
      />

      {/* 範囲経路計算が済んでいる範囲のときだけ表示する */}
      {rangeReady && (
        <ToggleSection
          title="経路表示"
          checked={draft.pathVisible}
          onChange={() => applyField({ pathVisible: !draft.pathVisible })}
        />
      )}

      {draft.positionVisible && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>推定時刻</div>
          <div className={styles.timeBoard}>{estimateTs === null ? "反応なし" : formatTime(estimateTs)}</div>
        </div>
      )}

      {/* 設定エリアの端から端まで使う。範囲が広いほど1秒あたりの幅が狭くなる */}
      {rangeReady && (
        <div className={styles.sliderRow}>
          <input
            type="range"
            className={styles.slider}
            min={startSec}
            max={endSec - 1}
            step={1}
            value={sliderTs}
            onChange={(e) => setSliderTs(Number(e.target.value))}
          />
          <span className={styles.sliderTime}>{formatTime(sliderTs)}</span>
        </div>
      )}

      <div className={styles.templateSection}>
        <input
          type="text"
          className={styles.templateInput}
          placeholder="テンプレ名"
          value={templateName}
          disabled={draft.realtime}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <button className={styles.saveButton} disabled={draft.realtime} onClick={handleSaveTemplate}>
          テンプレ保存
        </button>
        <select
          className={styles.select}
          defaultValue=""
          disabled={draft.realtime}
          onChange={handleLoadTemplate}
        >
          <option value="">テンプレを選択…</option>
          {templateNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {templateMessage && <div className={styles.csvMessage}>{templateMessage}</div>}
      </div>
    </div>
  );
}
