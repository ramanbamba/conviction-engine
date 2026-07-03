import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const snapshotsDir = path.join(root, 'data/snapshots')

if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true })

const DAYS = 30
const baseVal = 7000000
const baseInv = 6000000

const now = new Date()

for (let i = DAYS; i > 0; i--) {
  const d = new Date(now)
  d.setDate(d.getDate() - i)
  
  // Create some volatility
  const progress = (DAYS - i) / DAYS
  const valNoise = Math.sin(i * 0.5) * 150000
  const invGrowth = progress * 500000
  const valGrowth = progress * 1000000
  
  const val = Math.floor(baseVal + valGrowth + valNoise)
  const inv = Math.floor(baseInv + invGrowth)
  
  const pad = n => n.toString().padStart(2, '0')
  const ds = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`
  const fileDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  
  const fileName = `portfolio-${ds}-120000.json`
  
  const snap = {
    meta: {
      refreshDate: fileDate,
      refreshTime: '12:00 PM',
      source: 'Mock'
    },
    // We only need the totals for the history builder, but the actual snapshots have holdings too.
    // Let's just create an array of fake holdings that sum up to this so we can mimic real snapshots.
    holdings: [
      { sym: 'MOCK1', qty: 1, avg: inv, ltp: val, value: val, invested: inv }
    ]
  }
  
  fs.writeFileSync(path.join(snapshotsDir, fileName), JSON.stringify(snap, null, 2))
}

console.log(`Created ${DAYS} mock snapshots in ${snapshotsDir}`)
