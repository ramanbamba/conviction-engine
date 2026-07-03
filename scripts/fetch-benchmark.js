/**
 * fetch-benchmark.js
 *
 * Fetches Nifty 50 (^NSEI) daily closes and computes portfolio alpha
 * over YTD / 1Y / 3Y / inception windows.
 *
 * Output: src/data/benchmark.json
 * Usage:  npm run benchmark
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] })
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outPath = path.join(root, 'src/data/benchmark.json')
const historyPath = path.join(root, 'src/data/history.json')
const backtestPath = path.join(root, 'src/data/backtest.json')


function toDateStr(d) {
  return new Date(d).toISOString().split('T')[0]
}

function dateAdd(isoStr, days) {
  const d = new Date(isoStr)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function ytdStart() {
  return `${new Date().getFullYear()}-01-01`
}

function yearAgo(years = 1) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return toDateStr(d)
}

// Build a unified portfolio NAV series: { date -> value }
// Uses history.json (daily) for recent data, backtest.json monthly series for older
function buildPortfolioNav() {
  const nav = {}

  // backtest.json: monthly snapshots going back 5 years
  if (fs.existsSync(backtestPath)) {
    const bt = JSON.parse(fs.readFileSync(backtestPath, 'utf8'))
    for (const row of bt.series || []) {
      // month string e.g. "2023-05" — use first of month as key
      nav[`${row.date}-01`] = row.portfolioValue
    }
  }

  // history.json: daily snapshots, overrides monthly where overlapping
  if (fs.existsSync(historyPath)) {
    const hist = JSON.parse(fs.readFileSync(historyPath, 'utf8'))
    for (const row of hist) {
      nav[row.date] = row.totalVal
    }
  }

  return nav
}

// Find the most recent nav value on or before a target date
function navAt(nav, targetDate) {
  const sorted = Object.keys(nav).sort()
  let last = null
  for (const d of sorted) {
    if (d <= targetDate) last = nav[d]
    else break
  }
  return last
}

// Return the earliest date in nav
function navInceptionDate(nav) {
  return Object.keys(nav).sort()[0]
}

// Compute return % between two closes
function ret(startClose, endClose) {
  if (!startClose || !endClose || startClose === 0) return null
  return (endClose - startClose) / startClose
}

// From a daily series, pick one point per week (Friday or last available)
// to keep the JSON compact while preserving sparkline fidelity
function downsample(series, maxPoints = 52) {
  if (series.length <= maxPoints) return series
  const step = Math.floor(series.length / maxPoints)
  const out = []
  for (let i = 0; i < series.length; i += step) out.push(series[i])
  // Always include the last point
  if (out[out.length - 1] !== series[series.length - 1]) {
    out.push(series[series.length - 1])
  }
  return out
}

async function main() {
  console.log('📊 Fetching Nifty 50 benchmark data...')

  const today = toDateStr(new Date())
  const threeYearsAgo = yearAgo(3)

  let series = []
  try {
    const raw = await yahooFinance.historical('^NSEI', {
      period1: threeYearsAgo,
      period2: dateAdd(today, 1), // inclusive
      interval: '1d',
    })
    series = raw
      .filter(r => r.close != null)
      .map(r => ({ date: toDateStr(r.date), close: Math.round(r.close) }))
      .sort((a, b) => a.date.localeCompare(b.date))
    console.log(`  ✓ ${series.length} trading days fetched (${series[0]?.date} → ${series[series.length - 1]?.date})`)
  } catch (err) {
    console.error('  ✗ Failed to fetch ^NSEI:', err.message)
    process.exit(1)
  }

  const latestClose = series[series.length - 1]?.close ?? 0
  const latestDate = series[series.length - 1]?.date ?? today

  // Build a date→close lookup for benchmark
  const bClose = {}
  for (const row of series) bClose[row.date] = row.close

  // Find closest benchmark close on or after a date
  function benchAt(targetDate) {
    const sorted = series.map(r => r.date)
    for (const d of sorted) {
      if (d >= targetDate) return bClose[d]
    }
    return null
  }

  const portfolioNav = buildPortfolioNav()
  const inceptionDate = navInceptionDate(portfolioNav)

  // ── Window computations ──────────────────────────────────────────────────

  const windows = {}

  const defs = [
    { key: 'ytd',       label: 'YTD',       startDate: ytdStart() },
    { key: '1y',        label: '1Y',        startDate: yearAgo(1) },
    { key: '3y',        label: '3Y',        startDate: yearAgo(3) },
    { key: 'inception', label: 'Since Inception', startDate: inceptionDate },
  ]

  for (const { key, label, startDate } of defs) {
    const benchStart = benchAt(startDate)
    const benchEnd   = latestClose
    const navStart   = navAt(portfolioNav, startDate)
    const navEnd     = navAt(portfolioNav, today)

    const benchReturn     = ret(benchStart, benchEnd)
    const portfolioReturn = ret(navStart, navEnd)
    const alpha = (portfolioReturn != null && benchReturn != null)
      ? portfolioReturn - benchReturn
      : null

    windows[key] = {
      label,
      startDate,
      benchStart,
      benchEnd,
      benchReturn:     benchReturn     != null ? +benchReturn.toFixed(4)     : null,
      portfolioReturn: portfolioReturn != null ? +portfolioReturn.toFixed(4) : null,
      alpha:           alpha           != null ? +alpha.toFixed(4)           : null,
    }

    const sign = alpha != null ? (alpha >= 0 ? '+' : '') : '?'
    const pct  = alpha != null ? `${sign}${(alpha * 100).toFixed(1)}%` : 'n/a'
    console.log(`  ${label.padEnd(16)} benchmark ${((benchReturn ?? 0) * 100).toFixed(1).padStart(6)}%  portfolio ${((portfolioReturn ?? 0) * 100).toFixed(1).padStart(6)}%  alpha ${pct}`)
  }

  // ── 1Y normalized sparkline (100-indexed, weekly cadence) ────────────────

  const sparkStart = yearAgo(1)
  const sparkSeries = series.filter(r => r.date >= sparkStart)

  const b0 = sparkSeries[0]?.close ?? 1
  const p0 = navAt(portfolioNav, sparkStart) ?? 1

  const normalizedSpark = downsample(
    sparkSeries.map(r => {
      const benchIdx = +((r.close / b0) * 100).toFixed(2)
      // Portfolio: find closest nav entry on or before this date
      const navDates = Object.keys(portfolioNav).sort()
      let lastNavDate = navDates[0]
      for (const d of navDates) { if (d <= r.date) lastNavDate = d }
      const portVal = portfolioNav[lastNavDate] ?? p0
      const portIdx = +((portVal / p0) * 100).toFixed(2)
      return { date: r.date, benchIdx, portIdx }
    }),
    52
  )

  // ── Write output ──────────────────────────────────────────────────────────

  const output = {
    fetchedAt: new Date().toISOString(),
    symbol: '^NSEI',
    name: 'Nifty 50',
    latestClose,
    latestDate,
    windows,
    spark1y: normalizedSpark,
  }

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2))
  console.log(`\n✅ benchmark.json written (${normalizedSpark.length} sparkline points)`)
  console.log(`   Alpha 1Y: ${windows['1y'].alpha != null ? ((windows['1y'].alpha * 100).toFixed(1) + '%') : 'n/a'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
