import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

function loadMockRows() {
  return JSON.parse(
    fs.readFileSync(new URL('./mock/sensor_data.json', import.meta.url), 'utf-8')
  )
}

// npm run dev のときだけ、/api をGoサーバーの代わりに mock/sensor_data.json から返す
function mockApi() {
  return {
    name: 'mock-api',
    apply: 'serve', // 開発サーバーでのみ有効（npm run build の成果物には含まれない）
    configureServer(server) {
      // Goの ServeAvailability と同じ形で、データがある日付・時刻の一覧を返す
      server.middlewares.use('/api/sensor-data/availability', (req, res) => {
        const date = new URL(req.url, 'http://localhost').searchParams.get('date')
        // 日本時間の日付・時刻を得るため、9時間進めたDateをUTCとして読む
        const jstTimes = loadMockRows().map(
          (r) => new Date(new Date(r.node_timestamp).getTime() + JST_OFFSET_MS)
        )
        const result = date
          ? {
              seconds: [
                ...new Set(
                  jstTimes
                    .filter((t) => t.toISOString().slice(0, 10) === date)
                    .map((t) => t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds())
                ),
              ].sort((a, b) => a - b),
            }
          : { dates: [...new Set(jstTimes.map((t) => t.toISOString().slice(0, 10)))].sort() }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result))
      })

      // Vite内蔵のサーバーに、/api/sensor-data/recent を受け付ける処理を追加する
      server.middlewares.use('/api/sensor-data/recent', (req, res) => {
        const rows = loadMockRows()
        // Goの GetRecentLogs と同じ形・同じ並び（新しい順）に変換する
        const sensorData = rows
          .map((r) => ({
            node_id: r.node_id,
            rssi_hex: r.rssi_hex,
            timestamp: Math.floor(new Date(r.node_timestamp).getTime() / 1000),
            payload_hex: Object.keys(r.readings ?? {})
              .sort()
              .map((id) => `${id}=${r.readings[id]}`)
              .join(' / '),
          }))
          .reverse()
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ sensor_data: sensorData }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mockApi()],
})
