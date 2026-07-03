#!/usr/bin/env node
/**
 * fetch-universe.js — PHASE 19 Sprint D: the opportunity radar's universe list.
 *
 * Pulls the official NSE Nifty 200 constituent list (free, no auth, the
 * authoritative source) and writes it to src/data/universe.json, excluding
 * every symbol already held in the portfolio — this file is "what we don't
 * own yet." Stage 1 (fetch-universe-technicals.js) scores momentum + sector
 * over this list; Stage 2 (fetch-universe-fundamentals.js) deep-dives the
 * resulting shortlist only.
 *
 * Cadence: monthly-ish (index constituents change quarterly on rebalance).
 * Run: npm run universe:fetch
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'src/data/universe.json')
const PORTFOLIO_PATH = path.join(ROOT, 'src/data/portfolio.json')

const NSE_URL = 'https://archives.nseindia.com/content/indices/ind_nifty200list.csv'

// Minimal CSV parser — the NSE file has no quoted commas in practice, but guard anyway.
function parseCsv(text) {
  const lines = text.trim().split('\n')
  const header = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim())
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]))
  })
}

async function main() {
  console.log('Fetching NSE Nifty 200 constituent list...')
  const res = await fetch(NSE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } })
  if (!res.ok) throw new Error(`NSE fetch failed: HTTP ${res.status}`)
  const rows = parseCsv(await res.text())

  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'))
  const held = new Set(portfolio.holdings.map(h => h.sym.replace(/-PA$/, '')))

  const constituents = rows
    .map(r => ({ sym: r['Symbol'], name: r['Company Name'], industry: r['Industry'], isin: r['ISIN Code'] }))
    .filter(r => r.sym)

  const held_in_index = constituents.filter(c => held.has(c.sym)).map(c => c.sym)
  const universe = constituents.filter(c => !held.has(c.sym))

  const out = {
    asOf: new Date().toISOString().split('T')[0],
    source: 'NSE Nifty 200 official constituent list',
    totalConstituents: constituents.length,
    heldCount: held_in_index.length,
    universeCount: universe.length,
    held: held_in_index,
    stocks: universe,
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
  console.log(`Nifty 200: ${constituents.length} total, ${held_in_index.length} already held, ${universe.length} in the opportunity universe.`)
  console.log(`Wrote: ${OUT}`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
