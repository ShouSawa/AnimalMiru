import { useEffect, useRef, useState } from "react";
import styles from "./CalendarPicker.module.css";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const YEAR_MARGIN = 2; // 年一覧で、選択中・データのある年の前後に何年分表示するか

const pad2 = (v) => String(v).padStart(2, "0");

// 表示中の月のカレンダー（前後の月の日を含めた6週×7日）を作る
function buildDayCells(year, month) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => {
    // Dateは範囲外の日（0日や32日など）を前後の月に繰り上げて解釈する
    const date = new Date(year, month - 1, 1 - firstWeekday + i);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      weekday: date.getDay(),
      inMonth: date.getMonth() + 1 === month,
    };
  });
}

export default function CalendarPicker({ year, month, day, dataDates = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days"); // "days": 日の選択 / "years": 年月の選択
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);
  const [expandedYear, setExpandedYear] = useState(year);
  const containerRef = useRef(null);
  const expandedYearRef = useRef(null);

  const dataDays = new Set(dataDates);
  const dataMonths = new Set(dataDates.map((d) => d.slice(0, 7)));
  const dataYears = dataDates.map((d) => Number(d.slice(0, 4)));
  const today = new Date();

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // 年一覧を開いたとき・年を展開したときに、その年が見える位置までスクロールする
  useEffect(() => {
    if (view === "years") expandedYearRef.current?.scrollIntoView({ block: "nearest" });
  }, [view, expandedYear]);

  const togglePicker = () => {
    setViewYear(year);
    setViewMonth(month);
    setExpandedYear(year);
    setView("days");
    setOpen((prev) => !prev);
  };

  const shiftMonth = (delta) => {
    // 月の加減算で年をまたぐ場合もDateに繰り上げ・繰り下げを任せる
    const d = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  const selectDate = (y, m, d) => {
    onChange({ year: y, month: m, day: d });
    setOpen(false);
  };

  const selectMonth = (y, m) => {
    setViewYear(y);
    setViewMonth(m);
    setView("days");
  };

  const minYear = Math.min(year, today.getFullYear(), ...dataYears) - YEAR_MARGIN;
  const maxYear = Math.max(year, today.getFullYear(), ...dataYears) + YEAR_MARGIN;
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const weekdayLabel = WEEKDAYS[new Date(year, month - 1, day).getDay()];

  return (
    <div className={styles.container} ref={containerRef}>
      <button type="button" className={styles.trigger} onClick={togglePicker}>
        {year}/{pad2(month)}/{pad2(day)} ({weekdayLabel})
      </button>
      {open && (
        <div className={styles.popover}>
          <div className={styles.header}>
            <button
              type="button"
              className={styles.headerTitle}
              onClick={() => setView(view === "days" ? "years" : "days")}
            >
              {viewYear}年{viewMonth}月 {view === "days" ? "▾" : "▴"}
            </button>
            {view === "days" && (
              <div className={styles.navButtons}>
                <button type="button" className={styles.navButton} onClick={() => shiftMonth(-1)}>
                  ↑
                </button>
                <button type="button" className={styles.navButton} onClick={() => shiftMonth(1)}>
                  ↓
                </button>
              </div>
            )}
          </div>

          {view === "days" ? (
            <div className={styles.dayGrid}>
              {WEEKDAYS.map((w, i) => (
                <span
                  key={w}
                  className={`${styles.weekday} ${i === 0 ? styles.sunday : ""} ${
                    i === 6 ? styles.saturday : ""
                  }`}
                >
                  {w}
                </span>
              ))}
              {buildDayCells(viewYear, viewMonth).map((c) => {
                const key = `${c.year}-${pad2(c.month)}-${pad2(c.day)}`;
                const isSelected = c.year === year && c.month === month && c.day === day;
                const isToday =
                  c.year === today.getFullYear() &&
                  c.month === today.getMonth() + 1 &&
                  c.day === today.getDate();
                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      styles.dayCell,
                      c.inMonth ? "" : styles.outOfMonth,
                      dataDays.has(key) ? styles.hasData : "",
                      isToday ? styles.today : "",
                      isSelected ? styles.selected : "",
                    ].join(" ")}
                    onClick={() => selectDate(c.year, c.month, c.day)}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.yearList}>
              {years.map((y) => (
                <div key={y} ref={y === expandedYear ? expandedYearRef : null}>
                  <button
                    type="button"
                    className={`${styles.yearRow} ${y === expandedYear ? styles.yearRowExpanded : ""}`}
                    onClick={() => setExpandedYear(y === expandedYear ? null : y)}
                  >
                    <span className={dataYears.includes(y) ? styles.hasData : ""}>{y}</span>
                  </button>
                  {y === expandedYear && (
                    <div className={styles.monthGrid}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={[
                            styles.monthCell,
                            dataMonths.has(`${y}-${pad2(m)}`) ? styles.hasData : "",
                            y === viewYear && m === viewMonth ? styles.monthCurrent : "",
                          ].join(" ")}
                          onClick={() => selectMonth(y, m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.footerButton}
              onClick={() => selectDate(today.getFullYear(), today.getMonth() + 1, today.getDate())}
            >
              今日
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
