/**
 * fetch-nse-calendar.js
 *
 * Fetches the NSE event-calendar (single API call, ~600 upcoming board meetings)
 * and filters for our held symbols. Merges into ai-insights.json → catalystAlerts[].
 *
 * Usage:
 *   npm run calendar
 *   node scripts/fetch-nse-calendar.js [--dry-run]
 *
 * Strategy:
 *   - NSE /api/event-calendar returns all upcoming board meetings in one shot
 *   - Filter by portfolio syms — much faster than 36 individual API calls
 *   - Preserves human-crafted catalystAlerts (entries without `source` field)
 *   - Replaces stale nse-auto entries on each run (idempotent)
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORTFOLIO_PATH   = path.join(__dirname, '..', 'src', 'data', 'portfolio.json')
const AI_INSIGHTS_PATH = path.join(__dirname, '..', 'src', 'data', 'ai-insights.json')

const DRY_RUN = process.argv.includes('--dry-run')

// ETFs / MFs — no quarterly results, skip from NSE lookup
const SKIP_SYMS = new Set(['MOMOMENTUM', 'METALIETF', 'GOLDBEES', 'SILVERBEES', 'LIQUIDBEES'])

// Portfolio sym → NSE sym (where they differ)
// MARUTI-PA is the same underlying as MARUTI on NSE
const TO_NSE = { 'MARUTI-PA': 'MARUTI' }

// NSE sym → canonical portfolio sym (for building the alert)
// When NSE returns MARUTI, we emit alert for MARUTI (covers both legs)
const FROM_NSE = { 'MARUTI': 'MARUTI' }

const RESULTS_PURPOSE_RE = /financial\s*result/i

const MONTH_MAP = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
}

function parseNseDate(dateStr) {
  // "14-May-2026" → "2026-05-14" (manual parse avoids timezone shift)
  if (!dateStr || dateStr === '-') return null
  const [dd, mon, yyyy] = dateStr.split('-')
  const mm = MONTH_MAP[mon]
  if (!mm || !dd || !yyyy) return null
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

function riskFromPurpose(purpose) {
  const p = purpose.toLowerCase()
  if (p.includes('financial result')) return 'HIGH'
  return 'MEDIUM'
}

async function fetchEventCalendar() {
  const res = await fetch('https://www.nseindia.com/api/event-calendar', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0',
      'Accept':     'application/json',
      'Referer':    'https://www.nseindia.com/',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`NSE event-calendar: HTTP ${res.status}`)
  return res.json()
}

async function main() {
  const portfolio  = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'))
  const aiInsights = JSON.parse(fs.readFileSync(AI_INSIGHTS_PATH, 'utf8'))

  const today = new Date().toISOString().split('T')[0]

  // Build lookup: nseSym → portfolioSym (deduplicated)
  const nseToPortfolio = {}
  for (const h of portfolio.holdings) {
    if (SKIP_SYMS.has(h.sym)) continue
    const nseSym = TO_NSE[h.sym] ?? h.sym
    if (!nseToPortfolio[nseSym]) {
      nseToPortfolio[nseSym] = FROM_NSE[nseSym] ?? h.sym
    }
  }
  const watchedNseSyms = new Set(Object.keys(nseToPortfolio))

  console.log(`\nNSE Calendar Fetch — ${today}`)
  console.log(`Watching ${watchedNseSyms.size} NSE symbols...\n`)

  let events
  try {
    events = await fetchEventCalendar()
    console.log(`Fetched ${events.length} total NSE board meeting events`)
  } catch (err) {
    console.error(`Fatal: ${err.message}`)
    process.exit(1)
  }

  // Filter for our symbols, results-related, upcoming
  const hits = events.filter(e =>
    watchedNseSyms.has(e.symbol) &&
    parseNseDate(e.date) >= today &&
    RESULTS_PURPOSE_RE.test(e.purpose)
  )

  const newAlerts = hits.map(e => {
    const portfolioSym = nseToPortfolio[e.symbol]
    const date = parseNseDate(e.date)
    return {
      date,
      event:           `${portfolioSym} — ${e.purpose}`,
      stocks:          [portfolioSym],
      risk:            riskFromPurpose(e.purpose),
      portfolioAction: `${portfolioSym}: ${e.bm_desc ? e.bm_desc.slice(0, 120).trim() + '…' : 'Board meeting — check NSE for details.'}`,
      source:          'nse-auto',
    }
  }).sort((a, b) => a.date.localeCompare(b.date))

  // Preserve human-crafted alerts, replace nse-auto
  const humanAlerts = (aiInsights.catalystAlerts ?? []).filter(a => !a.source)
  const merged = [...humanAlerts, ...newAlerts].sort((a, b) => a.date.localeCompare(b.date))

  console.log(`\nUpcoming results in our portfolio:`)
  if (newAlerts.length === 0) {
    console.log('  (none found)')
  } else {
    newAlerts.forEach(a =>
      console.log(`  ${a.date}  ${a.stocks[0].padEnd(14)} ${a.event}`)
    )
  }

  // Show which watched syms have no events (may not be filed yet)
  const hitSyms = new Set(hits.map(e => nseToPortfolio[e.symbol]))
  const noEvent = [...watchedNseSyms]
    .map(s => nseToPortfolio[s])
    .filter(s => !hitSyms.has(s))

  if (noEvent.length) {
    console.log(`\nNo upcoming results filed yet (${noEvent.length}):`)
    console.log(`  ${noEvent.join(', ')}`)
  }

  console.log(`\n─────────────────────────────────────────`)
  console.log(`NSE events found:  ${newAlerts.length}`)
  console.log(`Human alerts kept: ${humanAlerts.length}`)
  console.log(`Total merged:      ${merged.length}`)

  if (DRY_RUN) {
    console.log('\n[dry-run] No files written.')
    return
  }

  aiInsights.catalystAlerts    = merged
  aiInsights.calendarFetchedAt = new Date().toISOString()

  fs.writeFileSync(AI_INSIGHTS_PATH, JSON.stringify(aiInsights, null, 2))
  console.log(`\nWritten → src/data/ai-insights.json`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
