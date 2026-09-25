export const TIME_RANGE_OPTIONS = [
  { value: 20, label: "20秒" },
  { value: 40, label: "40秒" },
  { value: 60, label: "1分" },
  { value: 90, label: "1分30秒" },
  { value: 120, label: "2分" },
  { value: 180, label: "3分" },
  { value: 300, label: "5分" },
  { value: 420, label: "7分" },
  { value: 600, label: "10分" },
];

export const TIME_AXIS_MODE_OPTIONS = [
  { value: "clock", label: "時刻" },
  { value: "elapsed", label: "経過時間" },
];

export const VALUE_UNIT_OPTIONS = [
  { value: "voltage", label: "電圧" },
  { value: "hex", label: "hex" },
  { value: "decimal", label: "decimal" },
];

export const DEFAULT_SETTINGS = {
  chartsVisible: true,
  timeRangeSeconds: 40,
  timeAxisMode: "clock",
  startDateTime: { year: 2026, month: 1, day: 22, hour: 14, minute: 9, second: 39 },
  valueUnit: "voltage",
};
