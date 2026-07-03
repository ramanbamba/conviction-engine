#!/usr/bin/env node
/**
 * fetch-fundamentals.js — Phase 15.2: the Screener.in fundamental scraper.
 *
 * Deep-fetches each holding's public Screener page (server-rendered HTML) and
 * parses the decade of fundamentals into src/data/fundamentals-raw.json. A
 * separate engine (fundamentalsEngine.js) turns that into grades/flags.
 *
 * Cadence: ONE-TIME deep fetch + results-triggered refresh. NOT in the daily
 * cron — fundamentals change ~quarterly. Run: npm run fundamentals [-- --stock WABAG]
 *
 * Ethics: public pages only, realistic UA, ≥1.6s throttle, sequential, back off
 * on 429, skip-on-fail (never fatal), respect the site. Label-based parsing so a
 * missing field logs rather than crashes.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { INGEST_SYMS, STOCK_SOURCES } from './lib/sources.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'src', 'data', 'fundamentals-raw.json')
const ARGV = process.argv.slice(2)
const ONE = ARGV.includes('--stock') ? ARGV[ARGV.indexOf('--stock') + 1] : null
const THROTTLE_MS = 1600
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Screener slug overrides where it differs from the NSE symbol
const SLUG = { 'M&MFIN': 'M%26MFIN' }
const slugFor = sym => SLUG[sym] ?? (STOCK_SOURCES[sym]?.nseSym ?? sym)

// ── tiny HTML helpers (label-based, defensive) ──
const num = s => { const m = String(s).replace(/,/g, '').match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null }

// Top-ratios: <span class="name"> LABEL </span> ... <span class="number">VAL</span>
function topRatio(html, label) {
  const re = new RegExp(`<span class="name">\\s*${label.replace(/[/]/g, '\\/')}\\s*</span>[\\s\\S]{0,160}?<span class="(?:nowrap )?value">([\\s\\S]{0,120}?)</span>`, 'i')
  const m = html.match(re)
  if (!m) return null
  const inner = m[1].match(/<span class="number">([^<]+)<\/span>/)
  return inner ? num(inner[1]) : num(m[1])
}

// ranges-table: <th colspan="2">TITLE</th> ... <td>X Years:</td><td>VAL%</td>
function rangesTable(html, title) {
  const re = new RegExp(`${title}</th>([\\s\\S]{0,400}?)</table>`, 'i')
  const block = html.match(re)
  if (!block) return null
  const out = {}
  for (const m of block[1].matchAll(/<td>([^<]+?):<\/td>\s*<td>([^<]*)<\/td>/g)) {
    const k = m[1].trim().toLowerCase().replace('10 years', '10y').replace('5 years', '5y').replace('3 years', '3y').replace('ttm', 'ttm').replace(/\s+/g, '')
    out[k] = num(m[2])
  }
  return Object.keys(out).length ? out : null
}

// data-table row: <td>LABEL …</td> (button optional) then <td>VAL</td>… until </tr>
function dataRow(html, label) {
  const re = new RegExp(`>\\s*${label}\\s*(?:&nbsp;)?[\\s\\S]{0,120}?</td>([\\s\\S]{0,2200}?)</tr>`, 'i')
  const m = html.match(re)
  if (!m) return null
  // grab every value cell; num() extracts the leading number (handles "18%", "5,197", "-27")
  const vals = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => num(x[1])).filter(v => v != null)
  return vals.length ? vals : null
}

function prosCons(html, cls) {
  const m = html.match(new RegExp(`class="${cls}"[\\s\\S]*?<ul>([\\s\\S]*?)</ul>`, 'i'))
  if (!m) return []
  return [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
}

async function fetchPage(sym) {
  const url = `https://www.screener.in/company/${slugFor(sym)}/consolidated/`
  let res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'Accept': 'text/html' }, signal: AbortSignal.timeout(15000) })
  // consolidated 404 → try standalone
  if (res.status === 404) {
    res = await fetch(`https://www.screener.in/company/${slugFor(sym)}/`, { headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124' }, signal: AbortSignal.timeout(15000) })
  }
  if (res.status === 429) throw new Error('429 rate-limited')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// Slice html between two section ids (Screener: quarters → profit-loss →
// balance-sheet → cash-flow → ratios → shareholding). Empty string if absent.
function section(html, fromId, toId) {
  const a = html.indexOf(`id="${fromId}"`)
  if (a < 0) return ''
  const b = toId ? html.indexOf(`id="${toId}"`, a) : -1
  return html.slice(a, b > a ? b : a + 80000)
}

// Quarterly Results table — sliced to the #quarters section so the row labels
// (Sales / OPM % / Net Profit, which recur in the annual P&L) can't cross-match.
// Returns last 8 quarters: { labels, sales, opmPct, netProfit }.
function quarterly(html) {
  const a = html.indexOf('id="quarters"')
  if (a < 0) return null
  const b = html.indexOf('id="profit-loss"', a)
  const sec = html.slice(a, b > a ? b : a + 60000)
  const labels = [...sec.matchAll(/<th[^>]*>\s*([A-Z][a-z]{2} \d{4})\s*<\/th>/g)].map(m => m[1])
  if (!labels.length) return null
  const take = arr => Array.isArray(arr) ? arr.slice(-8) : null
  const q = {
    labels: labels.slice(-8),
    sales: take(dataRow(sec, 'Sales')),
    opmPct: take(dataRow(sec, 'OPM %')),
    netProfit: take(dataRow(sec, 'Net Profit')),
  }
  return q.sales || q.netProfit ? q : null
}

function parse(html, sym) {
  const pledgeM = html.match(/pledged ([\d.]+)% of their holding/i)
  const promHoldM = html.match(/Promoter Holding:\s*([\d.]+)%/i)
  return {
    sym, asOf: new Date().toISOString().split('T')[0],
    snapshot: {
      pe: topRatio(html, 'Stock P/E'),
      roce: topRatio(html, 'ROCE'),
      roe: topRatio(html, 'ROE'),
      bookValue: topRatio(html, 'Book Value'),
      divYield: topRatio(html, 'Dividend Yield'),
      mcapCr: topRatio(html, 'Market Cap'),
      price: topRatio(html, 'Current Price'),
    },
    growth: {
      salesCagr: rangesTable(html, 'Compounded Sales Growth'),
      profitCagr: rangesTable(html, 'Compounded Profit Growth'),
      priceCagr: rangesTable(html, 'Stock Price CAGR'),
      roeHist: rangesTable(html, 'Return on Equity'),
    },
    series: {
      // Scoped to their sections — the quarterly table reuses these row labels,
      // and an unscoped match silently returns quarters (caught 2026-06-12: the
      // engine had been comparing 6yr CFO against ~6 QUARTERS of PAT).
      netProfit: dataRow(section(html, 'profit-loss', 'balance-sheet'), 'Net Profit'),
      opmPct: dataRow(section(html, 'profit-loss', 'balance-sheet'), 'OPM %'),
      borrowings: dataRow(section(html, 'balance-sheet', 'cash-flow'), 'Borrowings'),
      cfo: dataRow(section(html, 'cash-flow', 'ratios'), 'Cash from Operating Activity'),
    },
    quarterly: quarterly(html),
    ownership: {
      promoterPct: promHoldM ? parseFloat(promHoldM[1]) : null,
      pledgePct: pledgeM ? parseFloat(pledgeM[1]) : null,
    },
    pros: prosCons(html, 'pros'),
    cons: prosCons(html, 'cons'),
  }
}

async function main() {
  const syms = ONE ? [ONE] : INGEST_SYMS
  const out = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')) } catch { return { stocks: {} } } })()
  out.fetchedAt = new Date().toISOString().split('T')[0]
  out.source = 'screener.in'
  out.stocks = out.stocks || {}

  console.log(`\nScreener fundamentals — ${syms.length} stock(s), ${THROTTLE_MS}ms throttle\n`)
  let ok = 0, fail = 0
  for (let i = 0; i < syms.length; i++) {
    const sym = syms[i]
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${syms.length}] ${sym.padEnd(12)}`)
    try {
      const html = await fetchPage(sym)
      const d = parse(html, sym)
      out.stocks[sym] = d
      const miss = []
      if (d.snapshot.pe == null) miss.push('pe')
      if (!d.growth.profitCagr) miss.push('growth')
      ok++
      process.stdout.write(`✓ P/E ${d.snapshot.pe ?? '—'} · ROCE ${d.snapshot.roce ?? '—'} · pledge ${d.ownership.pledgePct ?? 0}%${miss.length ? `  ⚠ missing ${miss.join(',')}` : ''}\n`)
    } catch (e) {
      fail++
      process.stdout.write(`✗ ${e.message}\n`)
      if (/429/.test(e.message)) { console.log('  backing off 30s…'); await sleep(30000) }
    }
    if (i < syms.length - 1) await sleep(THROTTLE_MS)
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log(`\n  Scraped ${ok}/${syms.length}${fail ? ` · ${fail} failed` : ''} → src/data/fundamentals-raw.json`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
