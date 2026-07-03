#!/usr/bin/env node
/**
 * refresh-technicals-yahoo.js — Pulls 1y daily OHLC from Yahoo Finance (free, no auth)
 * and updates insights.json computedTechnicals for every holding.
 *
 * Usage:
 *   node scripts/refresh-technicals-yahoo.js              # refresh all
 *   node scripts/refresh-technicals-yahoo.js WABAG KEC    # refresh specific syms
 *
 * Computes: SMA50, SMA200, RSI14, 52w high/low, support (recent 60d low),
 *           resistance (recent 60d high), and distance vs SMAs.
 *
 * Yahoo URL: https://query1.finance.yahoo.com/v8/finance/chart/{SYM}.NS
 * - Tries .NS first (NSE); falls back to .BO (BSE) if NSE returns no data.
 * - LIQUIDBEES / MARUTI-PA / synthetic syms are skipped.
 */

import fs   from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, '..')
const INSIGHTS_PATH = path.join(ROOT, 'src/data/insights.json')
const PORTFOLIO_PATH = path.join(ROOT, 'src/data/portfolio.json')

// Yahoo Finance ticker overrides (where Yahoo symbol != portfolio sym)
const YAHOO_OVERRIDES = {
  'M&MFIN':    'M%26MFIN',         // URL-encode ampersand
  'MARUTI-PA': 'MARUTI',           // PA tranche = same instrument
  'KEC-PA':    'KEC',              // PA tranche = same instrument
  'LIQUIDBEES': null,              // constant NAV ~1000, skip
}

// ─── Technical computations ──────────────────────────────────────────────────
function sma(closes, period) {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  return slice.reduce((s, v) => s + v, 0) / period
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  // Use Wilder's smoothing on last `period` changes
  let gains = 0, losses = 0
  for (let i = changes.length - period; i < changes.length; i++) {
    if (changes[i] > 0) gains += changes[i]
    else losses += Math.abs(changes[i])
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

function fmt(n, decimals = 2) {
  if (n == null) return null
  return Number(n.toFixed(decimals))
}

// ─── Yahoo fetch ─────────────────────────────────────────────────────────────
async function fetchYahoo(sym) {
  const override = YAHOO_OVERRIDES[sym]
  if (override === null) return null  // explicit skip
  const yahooSym = override ?? sym

  const exchanges = ['NS', 'BO']
  for (const ex of exchanges) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}.${ex}?range=1y&interval=1d`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' }
      })
      if (!res.ok) continue
      const json = await res.json()
      const result = json.chart?.result?.[0]
      if (!result) continue
      const ts = result.timestamp || []
      const q  = result.indicators?.quote?.[0]
      if (!ts.length || !q?.close) continue

      const candles = []
      for (let i = 0; i < ts.length; i++) {
        const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]
        if (o == null || h == null || l == null || c == null) continue
        candles.push({ date: new Date(ts[i] * 1000).toISOString().split('T')[0], open: o, high: h, low: l, close: c })
      }
      if (candles.length < 30) continue
      return { exchange: ex, candles }
    } catch (e) {
      continue
    }
  }
  return null
}

// ─── Per-stock computation ───────────────────────────────────────────────────
function computeTechnicals(candles) {
  const closes = candles.map(c => c.close)
  const highs  = candles.map(c => c.high)
  const lows   = candles.map(c => c.low)
  const last   = closes[closes.length - 1]

  const sma50_v  = sma(closes, 50)
  const sma200_v = sma(closes, 200)
  const rsi14_v  = rsi(closes, 14)

  const high52w = Math.max(...highs)
  const low52w  = Math.min(...lows)

  // Support/resistance: 60-day swing extremes
  const lookback = Math.min(60, candles.length)
  const recentHighs = highs.slice(-lookback)
  const recentLows  = lows.slice(-lookback)

  return {
    asOf:    candles[candles.length - 1].date,
    last:    fmt(last),
    sma50:   fmt(sma50_v),
    sma200:  fmt(sma200_v),
    rsi14:   fmt(rsi14_v, 1),
    fiftyTwoWeekHigh: fmt(high52w),
    fiftyTwoWeekLow:  fmt(low52w),
    fromHighPct:  sma50_v != null ? fmt((last/high52w - 1) * 100, 1) : null,
    fromLowPct:   fmt((last/low52w - 1) * 100, 1),
    vsSma50Pct:   sma50_v  ? fmt((last/sma50_v  - 1) * 100, 1) : null,
    vsSma200Pct:  sma200_v ? fmt((last/sma200_v - 1) * 100, 1) : null,
    support:      fmt(Math.min(...recentLows)),
    resistance:   fmt(Math.max(...recentHighs)),
    candleCount:  candles.length,
    source: 'yahoo-finance'
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const insights = JSON.parse(await fs.readFile(INSIGHTS_PATH, 'utf8'))
  const portfolio = JSON.parse(await fs.readFile(PORTFOLIO_PATH, 'utf8'))
  const targetSyms = process.argv.slice(2)

  const allSyms = portfolio.holdings.map(h => h.sym)
  const syms = targetSyms.length ? targetSyms : allSyms

  insights.positions = insights.positions || {}

  const stats = { ok: 0, skipped: 0, failed: 0 }
  const failedSyms = []

  for (const sym of syms) {
    process.stdout.write(`${sym.padEnd(14)} ... `)
    const data = await fetchYahoo(sym)
    if (!data) {
      if (YAHOO_OVERRIDES[sym] === null) {
        console.log('SKIP (configured)')
        stats.skipped++
      } else {
        console.log('FAILED (no data)')
        stats.failed++
        failedSyms.push(sym)
      }
      continue
    }

    const tech = computeTechnicals(data.candles)
    insights.positions[sym] = insights.positions[sym] || {}
    insights.positions[sym].computedTechnicals = tech
    insights.positions[sym].refreshedAt = new Date().toISOString()

    console.log(`OK [.${data.exchange}] last=${tech.last} sma50=${tech.sma50} sma200=${tech.sma200} rsi=${tech.rsi14} 52w=[${tech.fiftyTwoWeekLow}-${tech.fiftyTwoWeekHigh}]`)
    stats.ok++

    // Tiny throttle to be polite to Yahoo
    await new Promise(r => setTimeout(r, 80))
  }

  insights.meta = insights.meta || {}
  insights.meta.technicalsRefreshedAt = new Date().toISOString()
  insights.meta.technicalsSource = 'yahoo-finance (1y daily)'

  await fs.writeFile(INSIGHTS_PATH, JSON.stringify(insights, null, 2))
  console.log(`\n${'='.repeat(60)}`)
  console.log(`OK: ${stats.ok}  Skipped: ${stats.skipped}  Failed: ${stats.failed}`)
  if (failedSyms.length) console.log(`Failed syms: ${failedSyms.join(', ')}`)
  console.log(`Wrote: ${INSIGHTS_PATH}`)
}

main().catch(e => { console.error(e); process.exit(1) })
