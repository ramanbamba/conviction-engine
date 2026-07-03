#!/usr/bin/env node
/**
 * close-pm-loop.js — Phase 16.3 runner: the tape recorder.
 *
 * Runs pmLoop over memory.json's pmLedger against the current book: stamps
 * reference prices on responded decisions, detects executions (position left
 * the book), and grades outcomes at T+30/T+90.
 *
 * Run after every Kite refresh (wired into npm run morning).
 *   node scripts/close-pm-loop.js [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { closePmLoop } from '../src/lib/pmLoop.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const D = path.join(__dirname, '..', 'src', 'data')
const DRY = process.argv.includes('--dry-run')

const memory = JSON.parse(fs.readFileSync(path.join(D, 'memory.json'), 'utf8'))
const portfolio = JSON.parse(fs.readFileSync(path.join(D, 'portfolio.json'), 'utf8'))

// Names that were decided on but have LEFT the book (executed exits) still need
// current prices to grade "did the exit dodge a fall?" at T+30/T+90 — holdings
// can't supply them, so fetch last close from Yahoo (data doctrine: no Kite).
async function yahooSeries(sym) {
  for (const ex of ['NS', 'BO']) {
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}.${ex}?range=3mo&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' }, signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const r = (await res.json())?.chart?.result?.[0]
      const ts = r?.timestamp, closes = r?.indicators?.quote?.[0]?.close
      if (!ts?.length || !closes?.length) continue
      return ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().split('T')[0], close: closes[i] }))
        .filter(x => x.close != null)
    } catch { /* try next exchange */ }
  }
  return null
}
const closeOnOrBefore = (series, date) => {
  const hits = series.filter(x => x.date <= date)
  return hits.length ? +hits[hits.length - 1].close.toFixed(2) : null
}

const held = new Set((portfolio.holdings || []).map(h => h.sym))
const departedEntries = (memory.pmLedger || [])
  .filter(e => ['RATIFY', 'VETO'].includes(e.response) && e.syms?.[0] && !held.has(e.syms[0]))

const quotes = {}
let retroStamps = 0
for (const sym of [...new Set(departedEntries.map(e => e.syms[0]))]) {
  const series = await yahooSeries(sym)
  if (!series?.length) continue
  quotes[sym] = +series[series.length - 1].close.toFixed(2)
  console.log(`  quote (departed): ${sym} ₹${quotes[sym]}`)
  // Retro repair: entries decided in the past need refPrice AT THE DECISION DATE,
  // not today's — otherwise the grade measures from the wrong starting line.
  for (const e of departedEntries.filter(x => x.syms[0] === sym && x.refPrice == null && x.respondedAt)) {
    const px = closeOnOrBefore(series, e.respondedAt)
    if (px != null) {
      e.refPrice = px; e.refDate = e.respondedAt
      if (e.executedAt && e.executedPrice == null) e.executedPrice = px
      retroStamps++
      console.log(`  retro refPrice: ${e.id} ₹${px} @ ${e.respondedAt}`)
    }
  }
}

const { ledger, events } = closePmLoop(memory.pmLedger || [], portfolio.holdings || [], quotes)

console.log(`\nPM loop — ${ledger.length} ledger entries`)
if (events.length === 0) console.log('  nothing to close today')
for (const ev of events) console.log('  · ' + ev)

if (!DRY && (events.length + retroStamps) > 0) {
  memory.pmLedger = ledger
  fs.writeFileSync(path.join(D, 'memory.json'), JSON.stringify(memory, null, 2) + '\n')
  console.log('\nWritten → src/data/memory.json')
} else if (DRY) {
  console.log('\n[dry-run] No files written.')
}
