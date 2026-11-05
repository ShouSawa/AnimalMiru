const CSV_HEADER = ["ノード番号", "通信強度", "タイムスタンプ", "ペイロード（16進）"];

const pad2 = (v) => String(v).padStart(2, "0");

// ペイロードはカンマを含むので、全ての値をダブルクォートで囲む
const csvRow = (cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",");

function downloadCsv(text, fileName) {
  // Excelで開いても日本語が文字化けしないよう、UTF-8のBOMを先頭に付ける
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// 開始日時から timeRangeSeconds 秒分のデータをDBから取得し、CSVファイルとしてダウンロードする
// 戻り値は出力した件数（データがなければ 0 で、ダウンロードはしない）
export async function exportSensorCsv(startDateTime, timeRangeSeconds) {
  const { year, month, day, hour, minute, second } = startDateTime;
  const from = new Date(year, month - 1, day, hour, minute, second).getTime() / 1000;

  const res = await fetch(`/api/sensor-data/logs?from=${from}&to=${from + timeRangeSeconds}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const logs = (await res.json()).sensor_data ?? [];
  if (logs.length === 0) return 0;

  const rows = logs.map((log) =>
    csvRow([
      log.node_id,
      log.rssi_hex,
      new Date(log.timestamp * 1000).toLocaleString("ja-JP"),
      log.payload_hex,
    ])
  );
  const text = [csvRow(CSV_HEADER), ...rows].join("\r\n") + "\r\n";
  const startLabel = `${year}${pad2(month)}${pad2(day)}_${pad2(hour)}${pad2(minute)}${pad2(second)}`;
  downloadCsv(text, `sensor_data_${startLabel}_${timeRangeSeconds}s.csv`);
  return logs.length;
}
