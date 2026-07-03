/**
 * fix-filings-dates.js
 *
 * Repairs mangled dates in src/data/filings.json.
 *
 * The upstream feed writes timestamps in a scrambled form:
 *   "25T20:05:45.41-05-2026"   →  {DD}T{HH:mm:ss.SSS}-{MM}-{YYYY}
 * which breaks `new Date()` parsing and chronological sorting.
 *
 * This normalizer rewrites each filing to:
 *   date:     "2026-05-25"                 (clean ISO date, used for sort/display)
 *   datetime: "2026-05-25T20:05:45.41"     (full timestamp, preserved)
 *
 * Idempotent — already-valid ISO dates are left untouched. Re-run anytime
 * the seed feed reintroduces the mangled format.
 *
 * Usage:
 *   node scripts/fix-filings-dates.js [--dry-run]
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILINGS_PATH = path.join(__dirname, '..', 'src', 'data', 'filings.json')
const DRY_RUN = process.argv.includes('--dry-run')

// Mangled: 25T20:05:45.41-05-2026  →  DD T TIME - MM - YYYY
const MANGLED_RE = /^(\d{1,2})T([\d:.]+)-(\d{2})-(\d{4})$/

function normalize(raw) {
  if (!raw || typeof raw !== 'string') return null

  const m = raw.match(MANGLED_RE)
  if (m) {
    const [, dd, time, mm, yyyy] = m
    const day = dd.padStart(2, '0')
    return { date: `${yyyy}-${mm}-${day}`, datetime: `${yyyy}-${mm}-${day}T${time}` }
  }

  // Already ISO-ish: 2026-05-25 or 2026-05-25T20:05:45
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]([\d:.]+))?/)
  if (iso) {
    return { date: iso[1], datetime: iso[2] ? `${iso[1]}T${iso[2]}` : iso[1] }
  }

  // Unparseable — leave the date out so the UI can skip it gracefully
  return null
}

function main() {
  const data = JSON.parse(fs.readFileSync(FILINGS_PATH, 'utf8'))
  const holdings = data.holdings ?? {}

  let fixed = 0, ok = 0, bad = 0, total = 0

  for (const sym of Object.keys(holdings)) {
    const filings = holdings[sym].filings ?? []
    for (const f of filings) {
      total++
      const norm = normalize(f.date)
      if (!norm) { bad++; continue }
      const wasMangled = MANGLED_RE.test(f.date)
      f.date = norm.date
      f.datetime = norm.datetime
      if (wasMangled) fixed++; else ok++
    }
    // Re-sort newest first now that dates are clean
    filings.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }

  console.log(`\nFilings date repair`)
  console.log(`  Total entries:   ${total}`)
  console.log(`  Repaired:        ${fixed}`)
  console.log(`  Already valid:   ${ok}`)
  console.log(`  Unparseable:     ${bad}`)

  if (DRY_RUN) { console.log('\n[dry-run] No files written.'); return }

  fs.writeFileSync(FILINGS_PATH, JSON.stringify(data, null, 2))
  console.log(`\nWritten → src/data/filings.json`)
}

main()
