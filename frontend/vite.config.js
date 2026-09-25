import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// npm run dev のときだけ、/api をGoサーバーの代わりに mock/sensor_data.json から返す
function mockApi() {
  return {
    name: 'mock-api',
    apply: 'serve', // 開発サーバーでのみ有効（npm run build の成果物には含まれない）
    configureServer(server) {
      // Vite内蔵のサーバーに、/api/sensor-data/recent を受け付ける処理を追加する
      server.middlewares.use('/api/sensor-data/recent', (req, res) => {
        const rows = JSON.parse(
          fs.readFileSync(new URL('./mock/sensor_data.json', import.meta.url), 'utf-8')
        )
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
