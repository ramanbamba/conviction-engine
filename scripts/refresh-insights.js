#!/usr/bin/env node
/**
 * refresh-insights.js — Monthly insight refresh via Kite historical OHLC
 *
 * Usage:
 *   node scripts/refresh-insights.js            # refresh all stale positions
 *   node scripts/refresh-insights.js WABAG      # refresh specific symbol
 *   node scripts/refresh-insights.js --force    # refresh all regardless of TTL
 *
 * What it does:
 *   1. Reads portfolio.json, insights.json, scrip_map.json
 *   2. For each position due for refresh (refreshDue < today OR --force):
 *      a. Fetches 252 days of OHLC from Kite historical API
 *      b. Computes SMA50, SMA200, RSI14, 52w high/low, distance from SMAs
 *      c. Updates computedTechnicals in insights.json
 *      d. Sets refreshDue = today + 30 days
 *   3. Writes back to src/data/insights.json
 *
 * Kite auth: set KITE_ACCESS_TOKEN env var (get from Kite developer console
 * or from the MCP session after login). KITE_API_KEY also required.
 *
 * Run monthly via cron or manually before a morning review session.
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, '..')

// ─── Config ─────────────────────────────────────────────────────────────────
const INSIGHTS_PATH  = path.join(ROOT, 'src/data/insights.json')
const PORTFOLIO_PATH = path.join(ROOT, 'src/data/portfolio.json')
const SCRIP_MAP_PATH = path.join(ROOT, 'src/data/scrip_map.json')

const KITE_API_KEY      = process.env.KITE_API_KEY      || ''
const KITE_ACCESS_TOKEN = process.env.KITE_ACCESS_TOKEN || ''

const FORCE  = process.argv.includes('--force')
const TARGET = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1])

// ─── Kite helpers ────────────────────────────────────────────────────────────
async function fetchKiteOHLC(instrumentToken, fromDate, toDate) {
  const url = `https://api.kite.trade/instruments/historical/${instrumentToken}/day` +
    `?from=${fromDate}&to=${toDate}&continuous=0&oi=0`

  const res = await fetch(url, {
    headers: {
      'X-Kite-Version': '3',
      'Authorization': `token ${KITE_API_KEY}:${KITE_ACCESS_TOKEN}`
    }
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Kite OHLC ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = await res.json()
  // candles: [ [datetime, open, high, low, close, volume], ... ]
  return (json.data?.candles || []).map(c => ({
    date:   c[0].split('T')[0],
    open:   c[1],
    high:   c[2],
    low:    c[3],
    close:  c[4],
    volume: c[5]
  }))
}

async function getInstrumentToken(sym) {
  // Kite instrument CSV has all tokens — search for NSE equity
  const res = await fetch('https://api.kite.trade/instruments/NSE', {
    headers: {
      'X-Kite-Version': '3',
      'Authorization': `token ${KITE_API_KEY}:${KITE_ACCESS_TOKEN}`
    }
  })
  const csv  = await res.text()
  const rows = csv.split('\n').slice(1) // skip header
  for (const row of rows) {
    const cols = row.split(',')
    if (cols[2] === sym && cols[9] === 'EQ') {
      return cols[0] // instrument_token
    }
  }
  return null
}

// ─── Technical computations ─────────────────────────────────────────────────
function sma(closes, period) {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  return slice.reduce((s, v) => s + v, 0) / period
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  const gains   = changes.map(c => c > 0 ? c : 0)
  const losses  = changes.map(c => c < 0 ? -c : 0)

  let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period
  let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2))
}

function computeTechnicals(candles, ltp) {
  const closes = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)

  const sma50   = sma(closes, 50)
  const sma200  = sma(closes, 200)
  const rsi14   = rsi(closes, 14)

  const yearCandles = candles.slice(-252)
  const high52w  = yearCandles.length ? Math.max(...yearCandles.map(c => c.high)) : null
  const low52w   = yearCandles.length ? Math.min(...yearCandles.map(c => c.low))  : null

  const cmp = ltp || closes.at(-1) || null

  return {
    sma50:            sma50  ? parseFloat(sma50.toFixed(2))  : null,
    sma200:           sma200 ? parseFloat(sma200.toFixed(2)) : null,
    rsi14,
    fiftyTwoWeekHigh: high52w ? parseFloat(high52w.toFixed(2)) : null,
    fiftyTwoWeekLow:  low52w  ? parseFloat(low52w.toFixed(2))  : null,
    ltpVsSma50Pct:    (sma50  && cmp) ? parseFloat(((cmp - sma50)  / sma50  * 100).toFixed(2)) : null,
    ltpVsSma200Pct:   (sma200 && cmp) ? parseFloat(((cmp - sma200) / sma200 * 100).toFixed(2)) : null,
    pctFromHigh52w:   (high52w && cmp) ? parseFloat(((cmp - high52w) / high52w * 100).toFixed(2)) : null,
    pctFromLow52w:    (low52w  && cmp) ? parseFloat(((cmp - low52w)  / low52w  * 100).toFixed(2)) : null,
    computedAt:       new Date().toISOString().split('T')[0],
    needsKiteRefresh: false
  }
}

// ─── Technical signal generator ─────────────────────────────────────────────
function technicalSignals(tech, holding) {
  const signals = []
  const { ltp, sl, avg } = holding

  if (tech.ltpVsSma200Pct !== null) {
    const above = tech.ltpVsSma200Pct >= 0
    signals.push({
      id:     'sma200_position',
      type:   'technical',
      label:  `${above ? '+' : ''}${tech.ltpVsSma200Pct}% vs 200 DMA (₹${tech.sma200})`,
      detail: above
        ? `Price above 200 DMA — long-term trend intact. Healthy positioning.`
        : `Price below 200 DMA — trend warning. Watch for continued deterioration.`,
      flag:   above ? 'green' : 'amber',
      metric: 'trend'
    })
  }

  if (tech.rsi14 !== null) {
    const flag = tech.rsi14 > 70 ? 'amber' : tech.rsi14 < 30 ? 'green' : 'neutral'
    const label = tech.rsi14 > 70
      ? `RSI ${tech.rsi14} — overbought zone. Momentum may stall.`
      : tech.rsi14 < 30
        ? `RSI ${tech.rsi14} — oversold. Potential mean-reversion entry.`
        : `RSI ${tech.rsi14} — neutral momentum range.`
    signals.push({ id: 'rsi', type: 'technical', label, detail: label, flag, metric: 'momentum' })
  }

  if (tech.pctFromHigh52w !== null) {
    const pct = tech.pctFromHigh52w
    const flag = pct < -30 ? 'amber' : pct < -15 ? 'neutral' : 'green'
    signals.push({
      id:     '52w_range',
      type:   'technical',
      label:  `${pct}% from 52-week high ₹${tech.fiftyTwoWeekHigh}`,
      detail: pct < -25
        ? `Deep pullback from highs. Check if thesis driving high is still intact.`
        : pct < -10
          ? `Moderate pullback from highs — watch for base building.`
          : `Near 52-week highs — momentum strong, valuation premium applies.`,
      flag,
      metric: 'price_range'
    })
  }

  // SL proximity from technical context
  if (ltp && sl) {
    const slDist = ((ltp - sl) / ltp * 100)
    if (slDist < 5) {
      signals.push({
        id: 'sl_proximity_tech', type: 'technical',
        label:  `SL ₹${sl} is only ${slDist.toFixed(1)}% below CMP ₹${ltp}`,
        detail: `Critical proximity. One volatile session can trigger stop-loss. Reassess thesis vs reward.`,
        flag:   'red', metric: 'stop_loss'
      })
    }
  }

  return signals
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!KITE_ACCESS_TOKEN || !KITE_API_KEY) {
    console.error('ERROR: Set KITE_API_KEY and KITE_ACCESS_TOKEN environment variables.')
    console.error('Get your access token from Kite developer console or MCP session.')
    process.exit(1)
  }

  const insights  = JSON.parse(fs.readFileSync(INSIGHTS_PATH,  'utf-8'))
  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf-8'))
  const scripMap  = JSON.parse(fs.readFileSync(SCRIP_MAP_PATH, 'utf-8'))

  const holdingMap = {}
  portfolio.holdings.forEach(h => { holdingMap[h.sym] = h })

  const today    = new Date()
  const fromDate = new Date(today); fromDate.setDate(fromDate.getDate() - 365)
  const toDate   = today.toISOString().split('T')[0]
  const fromStr  = fromDate.toISOString().split('T')[0]

  const refreshDueDate = new Date(today); refreshDueDate.setDate(refreshDueDate.getDate() + 30)
  const nextRefresh    = refreshDueDate.toISOString().split('T')[0]

  const syms = TARGET
    ? [TARGET]
    : Object.keys(insights.positions).filter(sym => {
        if (FORCE) return true
        const pos = insights.positions[sym]
        return !pos.computedTechnicals?.computedAt ||
               new Date(pos.refreshDue || '2000-01-01') < today
      })

  console.log(`\nRefreshing ${syms.length} position(s): ${syms.join(', ')}\n`)

  // Fetch instrument token map once (reuse for all symbols)
  console.log('Fetching NSE instrument list...')
  const instrumentRes = await fetch('https://api.kite.trade/instruments/NSE', {
    headers: { 'X-Kite-Version': '3', 'Authorization': `token ${KITE_API_KEY}:${KITE_ACCESS_TOKEN}` }
  })
  const csv = await instrumentRes.text()
  const tokenMap = {}
  csv.split('\n').slice(1).forEach(row => {
    const cols = row.split(',')
    if (cols[9] === 'EQ') tokenMap[cols[2]] = cols[0]
  })

  for (const sym of syms) {
    const pos      = insights.positions[sym]
    const holding  = holdingMap[sym] || holdingMap[sym.replace('-PA', '')]
    const nsnSym   = sym.replace('-PA', '') // strip PA suffix for NSE lookup

    if (!pos) { console.warn(`  SKIP ${sym}: not in insights.json`); continue }
    if (!scripMap[sym] && !tokenMap[nsnSym]) {
      console.warn(`  SKIP ${sym}: no instrument token or scrip map entry`)
      continue
    }

    const instrToken = tokenMap[nsnSym]
    if (!instrToken) {
      console.warn(`  SKIP ${sym}: no instrument token in NSE list`)
      continue
    }

    try {
      console.log(`  Fetching ${sym} (token ${instrToken})...`)
      const candles = await fetchKiteOHLC(instrToken, fromStr, toDate)

      if (candles.length < 50) {
        console.warn(`  SKIP ${sym}: only ${candles.length} candles returned`)
        continue
      }

      const tech      = computeTechnicals(candles, holding?.ltp)
      const techSigs  = technicalSignals(tech, holding || {})

      // Merge technical signals into existing signals (replace old tech signals)
      const existingSigs  = (pos.signals || []).filter(s => s.type !== 'technical')
      const existingRisks = (pos.risks   || []).filter(s => s.id  !== 'sl_proximity_tech')
      const newRedFlags   = techSigs.filter(s => s.flag === 'red')
      const newOtherSigs  = techSigs.filter(s => s.flag !== 'red')

      insights.positions[sym] = {
        ...pos,
        refreshDue:         nextRefresh,
        computedTechnicals: tech,
        signals:            [...existingSigs, ...newOtherSigs],
        risks:              [...existingRedFlags, ...newRedFlags]
      }

      console.log(`  ✓ ${sym}: SMA200=${tech.sma200}, RSI=${tech.rsi14}, 52wH=${tech.fiftyTwoWeekHigh}`)
      await new Promise(r => setTimeout(r, 350)) // rate limit
    } catch (err) {
      console.error(`  ERROR ${sym}: ${err.message}`)
    }
  }

  insights.lastRefreshed = today.toISOString().split('T')[0]
  fs.writeFileSync(INSIGHTS_PATH, JSON.stringify(insights, null, 2))
  console.log(`\nDone. Updated ${syms.length} positions. insights.json saved.\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
