#!/usr/bin/env node
/**
 * fetch-universe-fundamentals.js — PHASE 19 Sprint D, Stage 2: the narrow deep-dive.
 *
 * Scrapes Screener.in fundamentals ONLY for the Stage 1 shortlist (src/data/
 * universe-technicals.json .shortlist) — never the full 188-name universe. Same
 * parser + throttle discipline as fetch-fundamentals.js (the holdings scraper);
 * this is a second, separate cadence so the two never contend or get confused.
 *
 * Cadence: run right after screen-universe.js, only when the shortlist changes
 * meaningfully (monthly-ish). NOT a daily job — respects Screener the same way
 * the holdings fetcher does.
 *
 * Run: npm run universe:fundamentals
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SHORTLIST_PATH = path.join(ROOT, 'src/data/universe-technicals.json')
const OUT = path.join(ROOT, 'src/data/universe-fundamentals-raw.json')
const THROTTLE_MS = 1600
const sleep = ms => new Promise(r => setTimeout(r, ms))

const num = s => { const m = String(s).replace(/,/g, '').match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null }

function topRatio(html, label) {
  const re = new RegExp(`<span class="name">\\s*${label.replace(/[/]/g, '\\/')}\\s*</span>[\\s\\S]{0,160}?<span class="(?:nowrap )?value">([\\s\\S]{0,120}?)</span>`, 'i')
  const m = html.match(re)
  if (!m) return null
  const inner = m[1].match(/<span class="number">([^<]+)<\/span>/)
  return inner ? num(inner[1]) : num(m[1])
}

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

function dataRow(html, label) {
  const re = new RegExp(`>\\s*${label}\\s*(?:&nbsp;)?[\\s\\S]{0,120}?</td>([\\s\\S]{0,2200}?)</tr>`, 'i')
  const m = html.match(re)
  if (!m) return null
  const vals = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => num(x[1])).filter(v => v != null)
  return vals.length ? vals : null
}

function prosCons(html, cls) {
  const m = html.match(new RegExp(`class="${cls}"[\\s\\S]*?<ul>([\\s\\S]*?)</ul>`, 'i'))
  if (!m) return []
  return [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
}

async function fetchPage(sym) {
  const url = `https://www.screener.in/company/${sym}/consolidated/`
  let res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'Accept': 'text/html' }, signal: AbortSignal.timeout(15000) })
  if (res.status === 404) {
    res = await fetch(`https://www.screener.in/company/${sym}/`, { headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124' }, signal: AbortSignal.timeout(15000) })
  }
  if (res.status === 429) throw new Error('429 rate-limited')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function section(html, fromId, toId) {
  const a = html.indexOf(`id="${fromId}"`)
  if (a < 0) return ''
  const b = toId ? html.indexOf(`id="${toId}"`, a) : -1
  return html.slice(a, b > a ? b : a + 80000)
}

function quarterly(html) {
  const a = html.indexOf('id="quarters"')
  if (a < 0) return null
  const b = html.indexOf('id="profit-loss"', a)
  const sec = html.slice(a, b > a ? b : a + 60000)
  const labels = [...sec.matchAll(/<th[^>]*>\s*([A-Z][a-z]{2} \d{4})\s*<\/th>/g)].map(m => m[1])
  if (!labels.length) return null
  const take = arr => Array.isArray(arr) ? arr.slice(-8) : null
  const q = { labels: labels.slice(-8), sales: take(dataRow(sec, 'Sales')), opmPct: take(dataRow(sec, 'OPM %')), netProfit: take(dataRow(sec, 'Net Profit')) }
  return q.sales || q.netProfit ? q : null
}

function parse(html, sym) {
  const pledgeM = html.match(/pledged ([\d.]+)% of their holding/i)
  const promHoldM = html.match(/Promoter Holding:\s*([\d.]+)%/i)
  return {
    sym, asOf: new Date().toISOString().split('T')[0],
    snapshot: {
      pe: topRatio(html, 'Stock P/E'), roce: topRatio(html, 'ROCE'), roe: topRatio(html, 'ROE'),
      bookValue: topRatio(html, 'Book Value'), divYield: topRatio(html, 'Dividend Yield'),
      mcapCr: topRatio(html, 'Market Cap'), price: topRatio(html, 'Current Price'),
    },
    growth: {
      salesCagr: rangesTable(html, 'Compounded Sales Growth'),
      profitCagr: rangesTable(html, 'Compounded Profit Growth'),
      priceCagr: rangesTable(html, 'Stock Price CAGR'),
      roeHist: rangesTable(html, 'Return on Equity'),
    },
    series: {
      netProfit: dataRow(section(html, 'profit-loss', 'balance-sheet'), 'Net Profit'),
      opmPct: dataRow(section(html, 'profit-loss', 'balance-sheet'), 'OPM %'),
      borrowings: dataRow(section(html, 'balance-sheet', 'cash-flow'), 'Borrowings'),
      cfo: dataRow(section(html, 'cash-flow', 'ratios'), 'Cash from Operating Activity'),
    },
    quarterly: quarterly(html),
    ownership: { promoterPct: promHoldM ? parseFloat(promHoldM[1]) : null, pledgePct: pledgeM ? parseFloat(pledgeM[1]) : null },
    pros: prosCons(html, 'pros'),
    cons: prosCons(html, 'cons'),
  }
}

async function main() {
  const shortlistData = JSON.parse(fs.readFileSync(SHORTLIST_PATH, 'utf8'))
  const syms = shortlistData.shortlist
  const out = { fetchedAt: new Date().toISOString().split('T')[0], source: 'screener.in', shortlistAsOf: shortlistData.asOf, stocks: {} }

  console.log(`\nScreener fundamentals — Stage 2 shortlist, ${syms.length} stock(s), ${THROTTLE_MS}ms throttle\n`)
  let ok = 0, fail = 0
  for (let i = 0; i < syms.length; i++) {
    const sym = syms[i]
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${syms.length}] ${sym.padEnd(14)}`)
    try {
      const html = await fetchPage(sym)
      const d = parse(html, sym)
      out.stocks[sym] = d
      ok++
      process.stdout.write(`✓ P/E ${d.snapshot.pe ?? '—'} · ROCE ${d.snapshot.roce ?? '—'} · pledge ${d.ownership.pledgePct ?? 0}%\n`)
    } catch (e) {
      fail++
      process.stdout.write(`✗ ${e.message}\n`)
      if (/429/.test(e.message)) { console.log('  backing off 30s…'); await sleep(30000) }
    }
    if (i < syms.length - 1) await sleep(THROTTLE_MS)
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log(`\n  Scraped ${ok}/${syms.length}${fail ? ` · ${fail} failed` : ''} → src/data/universe-fundamentals-raw.json`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
