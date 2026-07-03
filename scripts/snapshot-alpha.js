#!/usr/bin/env node
/**
 * snapshot-alpha.js — the alpha model's tape recorder.
 *
 * Appends today's model output (score/tier per stock + price) to
 * src/data/alpha-history.json so the validation protocol in ALPHA_MODEL.md §4
 * can grade the model on forward returns by tier. Idempotent per date.
 * Wired into npm run morning; also: npm run alpha:snapshot
 *
 * --yahoo: fetch latest closes from Yahoo Finance (free, no auth) instead of
 * trusting portfolio.json ltp — makes the recorder runnable unattended in the
 * ingest cron, where there is no Kite session. Snapshot is stamped with the
 * price bar's actual date, so a Saturday run records Friday's close.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { rankBook } from '../src/lib/alphaModel.js'

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
const OUT = path.join(D, 'alpha-history.json')
const j = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'))
const USE_YAHOO = process.argv.includes('--yahoo')

const sleep = ms => new Promise(r => setTimeout(r, ms))

// sym → Yahoo base ticker (virtual -PA slices share the underlying's price)
const yahooBase = sym => sym.replace(/-PA$/, '')

async function fetchYahooClose(sym) {
  for (const ex of ['NS', 'BO']) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooBase(sym))}.${ex}?range=5d&interval=1d`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' } })
      if (!res.ok) continue
      const r = (await res.json())?.chart?.result?.[0]
      const closes = r?.indicators?.quote?.[0]?.close || []
      const ts = r?.timestamp || []
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] != null) return { close: closes[i], date: new Date(ts[i] * 1000).toISOString().split('T')[0] }
      }
    } catch { /* try next exchange */ }
  }
  return null
}

const portfolio = j('portfolio.json')
const rows = rankBook(portfolio.holdings, j('fundamentals.json'), j('insights.json'), j('ai-insights.json'))

const ltp = Object.fromEntries(portfolio.holdings.map(h => [h.sym, h.ltp]))
let asOf = new Date().toISOString().split('T')[0]

if (USE_YAHOO) {
  const dates = {}
  let hits = 0
  for (const h of portfolio.holdings) {
    const q = await fetchYahooClose(h.sym)
    if (q) { ltp[h.sym] = q.close; dates[q.date] = (dates[q.date] || 0) + 1; hits++ }
    else console.warn(`  yahoo: no price for ${h.sym} — keeping portfolio.json ltp`)
    await sleep(150)
  }
  if (hits < portfolio.holdings.length * 0.8) {
    console.error(`alpha-history: only ${hits}/${portfolio.holdings.length} Yahoo prices — refusing to record a bad tape`)
    process.exit(1)
  }
  // Stamp with the modal price-bar date (the actual trading day being recorded)
  asOf = Object.entries(dates).sort((a, b) => b[1] - a[1])[0][0]
  console.log(`alpha-history: yahoo prices ${hits}/${portfolio.holdings.length}, price date ${asOf}`)
}

const hist = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { snapshots: [] }
if (hist.snapshots.some(s => s.asOf === asOf)) {
  console.log(`alpha-history: already snapshotted ${asOf} — skipping`)
  process.exit(0)
}

hist.snapshots.push({
  asOf,
  modelVersion: '1.0',
  rows: rows.map(r => ({ sym: r.sym, score: r.model.score, tier: r.model.tier, conv: r.conv, ltp: ltp[r.sym] ?? null })),
})
hist.snapshots.sort((a, b) => new Date(a.asOf) - new Date(b.asOf))
fs.writeFileSync(OUT, JSON.stringify(hist, null, 2) + '\n')
console.log(`alpha-history: snapshotted ${rows.length} names @ ${asOf} (${hist.snapshots.length} total snapshots)`)
