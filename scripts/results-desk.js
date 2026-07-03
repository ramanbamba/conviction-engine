/**
 * results-desk.js
 *
 * Scaffolds src/data/results-desk.json — pre-registered expectations for every held
 * equity with a filed board-meeting date, BEFORE it prints. Post-hoc rationalization
 * is impossible if the desk locked its numbers first.
 *
 * Usage:
 *   npm run results:prep
 *   node scripts/results-desk.js [--dry-run]
 *
 * Source of dates: ai-insights.json catalystAlerts with source:'nse-auto' and a
 * "Financial Result" purpose (written by `npm run calendar`). Run calendar first.
 *
 * Idempotent: preserves any preBrief.expectations/killCriteria, verdict, or reUnderwrite
 * a human/Claude has already filled in; only stubs new stocks or updates printDate.
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORTFOLIO_PATH     = path.join(__dirname, '..', 'src', 'data', 'portfolio.json')
const AI_INSIGHTS_PATH   = path.join(__dirname, '..', 'src', 'data', 'ai-insights.json')
const RESULTS_DESK_PATH  = path.join(__dirname, '..', 'src', 'data', 'results-desk.json')

const DRY_RUN = process.argv.includes('--dry-run')

const RESULTS_PURPOSE_RE = /financial\s*result/i

// CLAUDE.md "Key Metrics by Sector" — 2-3 metrics per theme. Fallback covers
// themes the table doesn't name (Defence, IT, T&D, etc.) with generic P&L metrics.
const SECTOR_METRICS = {
  Banking:          ['NIM', 'Net NPA / PCR', 'PAT growth'],
  NBFC:             ['NIM', 'Gross/Net NPA', 'AUM growth'],
  Infra:            ['Order book', 'Order inflow growth', 'EBITDA margin'],
  Construction:     ['Order book', 'Order inflow growth', 'EBITDA margin'],
  Auto:             ['Volume growth', 'EBITDA margin', 'EV penetration'],
  'Auto Ancil':     ['Volume growth', 'EBITDA margin', 'EV penetration'],
  FMCG:             ['Volume growth', 'EBITDA margin', 'Market share'],
  Consumer:         ['Volume growth', 'EBITDA margin', 'Market share'],
  EMS:              ['Revenue growth', 'Margin trajectory', 'Customer concentration'],
  Renewable:        ['Capacity (MW)', 'PLF', 'Debt/EBITDA'],
}
const DEFAULT_METRICS = ['Revenue growth', 'EBITDA margin', 'PAT growth']

function quarterLabel(dateStr) {
  // Print month → the quarter being REPORTED (results lag ~1-2 months behind quarter-end).
  // Apr-Jun prints  → Q4 (Jan-Mar) of the FY ending that March.
  // Jul-Sep prints  → Q1 (Apr-Jun) of the FY ending next March.
  // Oct-Dec prints  → Q2 (Jul-Sep) of the FY ending next March.
  // Jan-Mar prints  → Q3 (Oct-Dec) of the FY ending that March.
  const [y, m] = dateStr.split('-').map(Number)
  if (m >= 4 && m <= 6)  return `Q4FY${String(y).slice(-2)}`
  if (m >= 7 && m <= 9)  return `Q1FY${String(y + 1).slice(-2)}`
  if (m >= 10 && m <= 12) return `Q2FY${String(y + 1).slice(-2)}`
  return `Q3FY${String(y).slice(-2)}`
}

function main() {
  const portfolio  = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'))
  const aiInsights = JSON.parse(fs.readFileSync(AI_INSIGHTS_PATH, 'utf8'))
  const existing    = fs.existsSync(RESULTS_DESK_PATH)
    ? JSON.parse(fs.readFileSync(RESULTS_DESK_PATH, 'utf8'))
    : { quarter: null, stocks: {} }

  const today = new Date().toISOString().split('T')[0]

  const themeBySym = {}
  portfolio.holdings.forEach(h => { themeBySym[h.sym] = h.theme })

  const printEvents = (aiInsights.catalystAlerts || [])
    .filter(a => a.source === 'nse-auto' && RESULTS_PURPOSE_RE.test(a.event))
    .flatMap(a => (a.stocks || []).map(sym => ({ sym, date: a.date })))

  if (printEvents.length === 0) {
    console.log('No filed "Financial Result" board-meeting dates found in ai-insights.catalystAlerts.')
    console.log('Run `npm run calendar` first, then re-run `npm run results:prep`.')
    process.exit(0)
  }

  const quarter = quarterLabel(printEvents[0].date)
  const stocks = { ...existing.stocks }
  let added = 0
  let updated = 0
  let backfilled = 0

  for (const { sym, date } of printEvents) {
    const prior = stocks[sym]
    if (!prior) {
      const metrics = SECTOR_METRICS[themeBySym[sym]] || DEFAULT_METRICS
      stocks[sym] = {
        printDate: date,
        preBrief: {
          expectations: metrics.map(metric => ({ metric, expected: '' })),
          killCriteria: [],
          asOf: today,
        },
        verdict: null,
        reUnderwrite: null,
      }
      added++
    } else if (prior.printDate !== date) {
      stocks[sym] = { ...prior, printDate: date }
      updated++
    }
  }

  // Phase 24: backfill reUnderwrite on any pre-Phase-24 entry missing the field.
  for (const sym of Object.keys(stocks)) {
    if (!('reUnderwrite' in stocks[sym])) {
      stocks[sym] = { ...stocks[sym], reUnderwrite: null }
      backfilled++
    }
  }

  const out = { quarter, stocks }

  console.log(`\nResults Desk — ${quarter}`)
  console.log(`  New stocks scaffolded: ${added}`)
  console.log(`  Print dates updated:   ${updated}`)
  if (backfilled) console.log(`  reUnderwrite backfilled: ${backfilled}`)
  console.log(`  Total tracked:         ${Object.keys(stocks).length}`)

  if (DRY_RUN) {
    console.log('\n[dry-run] No files written.')
    return
  }

  fs.writeFileSync(RESULTS_DESK_PATH, JSON.stringify(out, null, 2))
  console.log(`\nWritten → src/data/results-desk.json`)
}

main()
