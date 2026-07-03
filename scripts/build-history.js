import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

export function buildHistory() {
  const snapshotsDir = path.join(root, 'data/snapshots')
  const outPath = path.join(root, 'src/data/history.json')
  
  if (!fs.existsSync(snapshotsDir)) return 0
  
  const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.json'))
  
  const history = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(snapshotsDir, f), 'utf8'))
    const totalVal = data.holdings?.reduce((s, h) => s + (h.value ?? (h.qty * h.ltp)), 0) || 0
    const totalInv = data.holdings?.reduce((s, h) => s + (h.invested ?? (h.qty * h.avg)), 0) || 0
    // Support yyyy-mm-dd fallback parsing if time is messy
    const ts = new Date(`${data.meta.refreshDate} ${data.meta.refreshTime || ''}`).getTime()
    return {
      date: data.meta.refreshDate,
      time: data.meta.refreshTime,
      totalVal,
      totalInv,
      timestamp: isNaN(ts) ? new Date(data.meta.refreshDate).getTime() : ts
    }
  })
  
  // Dedup by date (keep latest per day)
  const byDate = {}
  history.forEach(h => {
    if (!byDate[h.date] || byDate[h.date].timestamp < h.timestamp) {
      byDate[h.date] = h
    }
  })
  
  const finalHistory = Object.values(byDate).sort((a, b) => a.timestamp - b.timestamp)
  
  fs.writeFileSync(outPath, JSON.stringify(finalHistory, null, 2))
  return finalHistory.length
}

if (process.argv[1] === __filename) {
  const count = buildHistory()
  console.log(`Built history.json with ${count} unique daily records.`)
}
