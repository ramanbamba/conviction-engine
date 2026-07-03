/**
 * fetch-nse-actions.js
 *
 * Fetches upcoming corporate actions (dividends, splits, bonuses) for all held
 * symbols from NSE and merges into ai-insights.json → catalystAlerts[].
 *
 * Usage:
 *   npm run actions
 *   node scripts/fetch-nse-actions.js [--dry-run]
 *
 * Strategy:
 *   - NSE /api/corporates-corporateActions returns all historical + upcoming entries per symbol
 *   - One request per portfolio symbol (~30 symbols, ~150ms delay = ~5s total)
 *   - Filters for ex-dates >= today (upcoming only)
 *   - Preserves human-crafted catalystAlerts (no `source` field)
 *   - Replaces stale nse-ca-auto entries on each run (idempotent)
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORTFOLIO_PATH   = path.join(__dirname, '..', 'src', 'data', 'portfolio.json')
const AI_INSIGHTS_PATH = path.join(__dirname, '..', 'src', 'data', 'ai-insights.json')

const DRY_RUN = process.argv.includes('--dry-run')
const DELAY_MS = 150

// ETFs / MFs — no corporate actions to track
const SKIP_SYMS = new Set(['MOMOMENTUM', 'METALIETF', 'GOLDBEES', 'SILVERBEES', 'LIQUIDBEES'])

// Portfolio sym → NSE sym
const TO_NSE = { 'MARUTI-PA': 'MARUTI' }

// NSE sym → canonical portfolio sym
const FROM_NSE = { 'MARUTI': 'MARUTI' }

const MONTH_MAP = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
}

function parseNseDate(dateStr) {
  if (!dateStr || dateStr === '-') return null
  const [dd, mon, yyyy] = dateStr.split('-')
  const mm = MONTH_MAP[mon]
  if (!mm || !dd || !yyyy) return null
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

function riskFromSubject(subject) {
  const s = subject.toLowerCase()
  if (s.includes('split') || s.includes('bonus')) return 'HIGH'
  if (s.includes('dividend')) return 'MEDIUM'
  return 'MEDIUM'
}

function labelFromSubject(subject) {
  const s = subject.toLowerCase()
  if (s.includes('bonus')) return 'Bonus Issue'
  if (s.includes('split')) return 'Stock Split'
  if (s.includes('interim dividend')) return 'Interim Dividend'
  if (s.includes('dividend')) return 'Dividend'
  if (s.includes('rights')) return 'Rights Issue'
  return 'Corporate Action'
}

function portfolioActionText(sym, subject) {
  const s = subject.toLowerCase()
  if (s.includes('split')) return `${sym}: Stock split — adjust qty and avg price post ex-date.`
  if (s.includes('bonus')) return `${sym}: Bonus issue — check ratio, update qty post-record date.`
  if (s.includes('dividend')) return `${sym}: Check dividend amount vs cost basis; hold through ex-date if worth it.`
  return `${sym}: ${subject.trim()}`
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchCorporateActions(nseSym) {
  const url = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=${nseSym}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0',
      'Accept':     'application/json',
      'Referer':    'https://www.nseindia.com/',
    },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function main() {
  const portfolio  = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'))
  const aiInsights = JSON.parse(fs.readFileSync(AI_INSIGHTS_PATH, 'utf8'))

  const today = new Date().toISOString().split('T')[0]

  // Build deduplicated NSE sym lookup
  const nseToPortfolio = {}
  for (const h of portfolio.holdings) {
    if (SKIP_SYMS.has(h.sym)) continue
    const nseSym = TO_NSE[h.sym] ?? h.sym
    if (!nseToPortfolio[nseSym]) {
      nseToPortfolio[nseSym] = FROM_NSE[nseSym] ?? h.sym
    }
  }
  const nseSyms = Object.keys(nseToPortfolio)

  console.log(`\nNSE Corporate Actions Fetch — ${today}`)
  console.log(`Fetching ${nseSyms.length} symbols (${DELAY_MS}ms delay)...\n`)

  const newAlerts = []
  const errors    = []

  for (let i = 0; i < nseSyms.length; i++) {
    const nseSym      = nseSyms[i]
    const portfolioSym = nseToPortfolio[nseSym]

    process.stdout.write(`  [${String(i+1).padStart(2)}/${nseSyms.length}] ${nseSym.padEnd(14)}`)

    try {
      const actions = await fetchCorporateActions(nseSym)

      const upcoming = actions.filter(a => {
        const d = parseNseDate(a.exDate)
        return d && d >= today
      })

      if (upcoming.length > 0) {
        for (const a of upcoming) {
          const date  = parseNseDate(a.exDate)
          const label = labelFromSubject(a.subject)
          newAlerts.push({
            date,
            event:           `${portfolioSym} — ${a.subject.trim()}`,
            stocks:          [portfolioSym],
            risk:            riskFromSubject(a.subject),
            portfolioAction: portfolioActionText(portfolioSym, a.subject),
            source:          'nse-ca-auto',
          })
          process.stdout.write(`✓  ${date}  ${label}\n`)
        }
      } else {
        process.stdout.write(`—  (no upcoming)\n`)
      }
    } catch (err) {
      process.stdout.write(`✗  ${err.message}\n`)
      errors.push(nseSym)
    }

    if (i < nseSyms.length - 1) await sleep(DELAY_MS)
  }

  newAlerts.sort((a, b) => a.date.localeCompare(b.date))

  // Preserve human alerts + calendar alerts; replace only nse-ca-auto
  const keepAlerts = (aiInsights.catalystAlerts ?? []).filter(a => a.source !== 'nse-ca-auto')
  const merged = [...keepAlerts, ...newAlerts].sort((a, b) => a.date.localeCompare(b.date))

  console.log(`\n─────────────────────────────────────────`)
  console.log(`Upcoming corporate actions found: ${newAlerts.length}`)
  console.log(`Kept (human + calendar):          ${keepAlerts.length}`)
  console.log(`Total merged:                     ${merged.length}`)
  if (errors.length) console.log(`Fetch errors (${errors.length}): ${errors.join(', ')}`)

  if (DRY_RUN) {
    console.log('\n[dry-run] No files written.')
    return
  }

  aiInsights.catalystAlerts      = merged
  aiInsights.actionsFetchedAt    = new Date().toISOString()

  fs.writeFileSync(AI_INSIGHTS_PATH, JSON.stringify(aiInsights, null, 2))
  console.log(`\nWritten → src/data/ai-insights.json`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
