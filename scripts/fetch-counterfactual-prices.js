#!/usr/bin/env node
/**
 * fetch-counterfactual-prices.js — auto-refresh prices for EXITED positions so the
 * Rearview "What selling cost you" counterfactuals stay current with zero manual input.
 *
 * Reads rearview.json.closedPositions, fetches the latest price per symbol from Yahoo
 * Finance (free, no auth — usable in the unattended cron, unlike Kite), and writes
 * counterfactual-prices.json. Re-run build-rearview.js afterwards to recompute deltas.
 *
 * Uses Yahoo's adjusted close (split/bonus-adjusted) so post-exit corporate actions
 * (e.g. RELIANCE 1:1 bonus) don't produce false "saved ₹XL" figures.
 *
 * Usage: node scripts/fetch-counterfactual-prices.js [--dry-run]
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REARVIEW_PATH = path.join(ROOT, 'src/data/rearview.json')
const OUT_PATH      = path.join(ROOT, 'src/data/counterfactual-prices.json')
const DRY_RUN = process.argv.includes('--dry-run')

// Yahoo ticker overrides where the portfolio sym != Yahoo sym
const YAHOO_OVERRIDES = {
  'M&MFIN': 'M%26MFIN',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Latest split/bonus-adjusted close. Tries the exit exchange first, then the other.
async function fetchAdjClose(sym, preferredEx) {
  const yahooSym = YAHOO_OVERRIDES[sym] ?? sym
  const order = preferredEx === 'BSE' ? ['BO', 'NS'] : ['NS', 'BO']
  for (const ex of order) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}.${ex}?range=5d&interval=1d&events=div%2Csplit`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' } })
      if (!res.ok) continue
      const json = await res.json()
      const result = json.chart?.result?.[0]
      if (!result) continue
      const adj = result.indicators?.adjclose?.[0]?.adjclose
      const close = result.indicators?.quote?.[0]?.close
      const series = (adj && adj.some(v => v != null)) ? adj : close
      if (!series) continue
      // last non-null
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] != null) return Number(series[i].toFixed(2))
      }
    } catch { continue }
  }
  return null
}

async function main() {
  const rearview = JSON.parse(fs.readFileSync(REARVIEW_PATH, 'utf8'))
  const closed = rearview.closedPositions || []
  if (!closed.length) { console.log('No closedPositions in rearview.json — run build-rearview first.'); return }

  console.log(`\nCounterfactual price refresh — ${closed.length} exited positions (Yahoo, adjusted)`)
  const prices = {}
  let ok = 0, miss = 0
  for (let i = 0; i < closed.length; i++) {
    const c = closed[i]
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${closed.length}] ${c.symbol.padEnd(14)}`)
    const px = await fetchAdjClose(c.symbol, c.exchange)
    if (px != null) { prices[c.symbol] = px; ok++; process.stdout.write(`✓ ₹${px}\n`) }
    else { miss++; process.stdout.write(`✗ unresolved\n`) }
    if (i < closed.length - 1) await sleep(120)
  }

  console.log(`\n  Priced: ${ok} · Unresolved: ${miss}`)
  if (DRY_RUN) { console.log('  [dry-run] not written'); return }

  fs.writeFileSync(OUT_PATH, JSON.stringify({
    fetchedAt: new Date().toISOString().split('T')[0],
    source: 'yahoo-adjclose',
    note: 'Split/bonus-adjusted latest close for exited positions. Auto-refreshed.',
    prices,
  }, null, 2))
  console.log(`  → src/data/counterfactual-prices.json`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
