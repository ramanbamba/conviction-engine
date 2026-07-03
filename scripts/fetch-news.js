/**
 * fetch-news.js
 *
 * Per-stock news ingestion via Google News RSS (free, no API key).
 * Writes src/data/news.json — last ~8 headlines per held stock, with
 * rating-change / brokerage detection so ratings show up automatically.
 *
 * Usage:
 *   npm run news
 *   node scripts/fetch-news.js [--dry-run]
 *
 * Strategy:
 *   - One Google News RSS query per unique company (clean name, last 30d)
 *   - Parse RSS items → { date, title, source, type, url }
 *   - Classify each headline: rating | results | order | news
 *   - Extract ratingSignals (upgrade/downgrade/initiate + target + broker)
 *   - Idempotent: overwrites news.json each run
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  INGEST_SYMS, getNewsQuery, detectBroker,
  RATING_RE, RESULTS_RE, ORDER_RE,
} from './lib/sources.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NEWS_PATH   = path.join(__dirname, '..', 'src', 'data', 'news.json')
const DRY_RUN     = process.argv.includes('--dry-run')
const DELAY_MS    = 400
const MAX_PER_SYM = 8

const sleep = ms => new Promise(r => setTimeout(r, ms))

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim()
}

function tag(field, xml) {
  const m = xml.match(new RegExp(`<${field}[^>]*>([\\s\\S]*?)</${field}>`, 'i'))
  if (!m) return ''
  let v = m[1]
  const cdata = v.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdata) v = cdata[1]
  return decodeEntities(v)
}

function classify(title) {
  if (RATING_RE.test(title))  return 'rating'
  if (RESULTS_RE.test(title)) return 'results'
  if (ORDER_RE.test(title))   return 'order'
  return 'news'
}

function detectTarget(title) {
  // ₹1,234 / Rs 1234 / Rs. 1,234 → numeric target price
  const m = title.match(/(?:₹|rs\.?\s*)\s*([\d,]+)/i)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

async function fetchNews(queryName) {
  const q   = encodeURIComponent(`"${queryName}" when:30d`)
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0',
      'Accept':     'application/rss+xml, application/xml, text/xml',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()

  const items = xml.split('<item>').slice(1).map(chunk => {
    const block   = chunk.split('</item>')[0]
    let   title   = tag('title', block)
    const link    = tag('link', block)
    const pubDate = tag('pubDate', block)
    const source  = tag('source', block)

    // Google News titles end with " - Source"; strip it for cleanliness
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim()
    } else {
      title = title.replace(/\s+-\s+[^-]+$/, '').trim()
    }

    const date = pubDate ? new Date(pubDate).toISOString().split('T')[0] : null
    return { date, title, source, url: link }
  }).filter(it => it.title && it.date)

  return items
}

async function main() {
  const today = new Date().toISOString().split('T')[0]

  // Canonical ingest list from the source registry (ETFs/dupes already excluded)
  const targets = INGEST_SYMS.map(sym => ({ sym, query: getNewsQuery(sym) }))

  console.log(`\nGoogle News Fetch — ${today}`)
  console.log(`Fetching ${targets.length} stocks (${DELAY_MS}ms delay)...\n`)

  const stocks = {}
  const errors = []
  let totalHeadlines = 0
  let totalRatings   = 0

  for (let i = 0; i < targets.length; i++) {
    const { sym, query } = targets[i]
    process.stdout.write(`  [${String(i+1).padStart(2)}/${targets.length}] ${sym.padEnd(12)}`)

    try {
      const items = await fetchNews(query)
      items.sort((a, b) => b.date.localeCompare(a.date))

      const headlines = items.slice(0, MAX_PER_SYM).map(it => ({
        ...it,
        type: classify(it.title),
      }))

      const ratingSignals = headlines
        .filter(h => h.type === 'rating')
        .map(h => ({
          date:   h.date,
          title:  h.title,
          broker: detectBroker(h.title),
          target: detectTarget(h.title),
          url:    h.url,
        }))

      stocks[sym] = {
        query,
        headlines,
        ratingSignals,
      }

      totalHeadlines += headlines.length
      totalRatings   += ratingSignals.length

      const ratingTag = ratingSignals.length ? `  ⚑ ${ratingSignals.length} rating` : ''
      process.stdout.write(`✓  ${headlines.length} headlines${ratingTag}\n`)
    } catch (err) {
      process.stdout.write(`✗  ${err.message}\n`)
      errors.push(sym)
      stocks[sym] = { query, headlines: [], ratingSignals: [] }
    }

    if (i < targets.length - 1) await sleep(DELAY_MS)
  }

  console.log(`\n─────────────────────────────────────────`)
  console.log(`Stocks fetched:    ${targets.length - errors.length}/${targets.length}`)
  console.log(`Total headlines:   ${totalHeadlines}`)
  console.log(`Rating signals:    ${totalRatings}`)
  if (errors.length) console.log(`Fetch errors (${errors.length}): ${errors.join(', ')}`)

  if (DRY_RUN) {
    console.log('\n[dry-run] No files written.')
    return
  }

  const out = {
    fetchedAt: new Date().toISOString(),
    source:    'google-news-rss',
    window:    '30d',
    stocks,
  }
  fs.writeFileSync(NEWS_PATH, JSON.stringify(out, null, 2))
  console.log(`\nWritten → src/data/news.json`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
