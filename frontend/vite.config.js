import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

function loadMockRows() {
  return JSON.parse(
    fs.readFileSync(new URL('./mock/sensor_data.json', import.meta.url), 'utf-8')
  )
}

// リアルタイムモード確認用: 直近1時間以内を問い合わせられたら、テストデータを現在時刻に並べ直して繰り返し流す
const REPLAY_RECENT_SECONDS = 3600
const REPLAY_GAP_SECONDS = 5 // 1周ごとに全センサのデータが途切れる区間
// センサ単位の途切れの確認用: 各周の開始からこの区間だけ、0003 の A3 のデータを流さない
const REPLAY_DROP = { nodeId: '0003', sensorId: 'A3', fromOffset: 25, toOffset: 35 }

// [from, to) に入るテストデータの行を、時刻の昇順で { base: 時刻(UNIX秒), r: 行, dropSensor } の形で返す
function mockRowsInRange(from, to) {
  const rows = loadMockRows()
  const times = rows.map((r) => new Date(r.node_timestamp).getTime() / 1000)
  if (to < Date.now() / 1000 - REPLAY_RECENT_SECONDS) {
    return rows
      .map((r, i) => ({ base: times[i], r }))
      .filter(({ base }) => base >= from && base < to)
  }
  // 周期 period ごとに、テストデータの先頭からの経過秒数(offset)を保ったまま並べる
  const first = times[0]
  const period = Math.ceil(times[times.length - 1] - first) + REPLAY_GAP_SECONDS
  const result = []
  for (let k = Math.floor(from / period) - 1; k * period < to; k++) {
    rows.forEach((r, i) => {
      const offset = times[i] - first
      const base = k * period + offset
      if (base < from || base >= to) return
      const drop =
        r.node_id === REPLAY_DROP.nodeId &&
        offset >= REPLAY_DROP.fromOffset &&
        offset < REPLAY_DROP.toOffset
      result.push({ base, r, dropSensor: drop ? REPLAY_DROP.sensorId : null })
    })
  }
  return result
}

// テストデータの1行を、Goの sensor_data と同じ形（payload_hex は A1,A2,A3 の順に3値ずつ並べる）に変換する
// 流さないセンサの値は空文字にして、フロント側で読み飛ばされるようにする
function toSensorEntry({ base, r, dropSensor }) {
  const columns = ['A1', 'A2', 'A3'].map((id) =>
    id === dropSensor ? [] : (r.readings?.[id] ?? '').split(',')
  )
  const rounds = Math.max(...columns.map((c) => c.length))
  const values = []
  for (let i = 0; i < rounds; i++) columns.forEach((c) => values.push(c[i] ?? ''))
  return { node_id: r.node_id, rssi_hex: r.rssi_hex, timestamp: base, payload_hex: values.join(',') }
}

// テキストを1つのWebSocketフレームにする（サーバー→ブラウザ方向はマスク不要）
function wsTextFrame(text) {
  const payload = Buffer.from(text)
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.from([0x81, len])
  } else if (len < 65536) {
    header = Buffer.from([0x81, 126, len >> 8, len & 255])
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([header, payload])
}

// npm run dev のときだけ、/api をGoサーバーの代わりに mock/sensor_data.json から返す
function mockApi() {
  return {
    name: 'mock-api',
    apply: 'serve', // 開発サーバーでのみ有効（npm run build の成果物には含まれない）
    configureServer(server) {
      // Goの /ws/realtime と同じ形で、テストデータを1秒ごとに配信する
      // （ハンドシェイクとテキスト送信だけを最小限に実装。ViteのHMR用の接続は別プロトコルなので影響しない）
      server.httpServer?.on('upgrade', (req, socket) => {
        if (!req.url.startsWith('/ws/realtime')) return
        // RFC 6455 で決められた固定文字列を連結したSHA-1を返すと、接続が確立する
        const accept = crypto
          .createHash('sha1')
          .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64')
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
        )
        let sentUntil = Date.now() / 1000
        const id = setInterval(() => {
          const now = Date.now() / 1000
          const sensorData = mockRowsInRange(sentUntil, now).map(toSensorEntry)
          sentUntil = now
          if (sensorData.length) {
            socket.write(wsTextFrame(JSON.stringify({ gateway_id: 'mock', sensor_data: sensorData })))
          }
        }, 1000)
        // ブラウザから切断フレーム(opcode 8)が来たら閉じる
        socket.on('data', (buf) => {
          if ((buf[0] & 0x0f) === 0x8) socket.end()
        })
        socket.on('close', () => clearInterval(id))
        socket.on('error', () => clearInterval(id))
      })

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

      // Goの ServeSeries と同じ形で、[from, to) の値をノード→センサ→[[UNIX秒, 値], ...] で返す
      server.middlewares.use('/api/sensor-data/series', (req, res) => {
        const params = new URL(req.url, 'http://localhost').searchParams
        const from = Number(params.get('from'))
        const to = Number(params.get('to'))
        const series = {}
        for (const { base, r, dropSensor } of mockRowsInRange(from, to)) {
          series[r.node_id] ??= {}
          for (const [sensorId, hex] of Object.entries(r.readings ?? {})) {
            if (sensorId === dropSensor) continue
            const points = (series[r.node_id][sensorId] ??= [])
            // i番目の値は受信時刻 + i×35ms に測定されたものとして扱う
            hex.split(',').forEach((h, i) => points.push([base + i * 0.035, parseInt(h, 16)]))
          }
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ series }))
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
