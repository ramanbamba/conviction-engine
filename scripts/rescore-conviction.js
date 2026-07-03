/**
 * rescore-conviction.js — the conviction re-score machinery.
 *
 * The deterministic halves of the loop; Claude supplies the judgment between
 * them (in-session, or via the scheduled agent). Zero API cost on Pro.
 *
 *   1. PREP   node scripts/rescore-conviction.js --prep
 *      Scans news + signals for MATERIAL new info (results / rating / order in
 *      the last N days, or a flagged signal) and bundles an evidence pack per
 *      affected stock → src/data/rescore-evidence.json
 *
 *   2. (Claude reads the evidence, judges each thesis, writes decisions →
 *      src/data/rescore-decisions.json)
 *
 *   3. APPLY  node scripts/rescore-conviction.js --apply
 *      Applies decisions: updates portfolio.json conv, appends memory
 *      convictionLog, and writes the weekly digest → src/data/conviction-digest.json
 *
 * Flags: --prep | --apply | --days N (lookback, default 7) | --dry-run
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { INGEST_SYMS, getNewsQuery } from './lib/sources.js'
import { getBrainEntry, parseDimensions } from '../src/lib/brainIndexParser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const D = f => path.join(__dirname, '..', 'src', 'data', f)

const ARGV     = process.argv.slice(2)
const DRY_RUN  = ARGV.includes('--dry-run')
const MODE     = ARGV.includes('--apply') ? 'apply' : 'prep'
const daysArg  = ARGV.indexOf('--days')
const LOOKBACK = daysArg >= 0 ? Number(ARGV[daysArg + 1]) : 7

const today = new Date().toISOString().split('T')[0]
const read  = f => JSON.parse(fs.readFileSync(D(f), 'utf8'))
const write = (f, obj) => { if (!DRY_RUN) fs.writeFileSync(D(f), JSON.stringify(obj, null, 2)) }

function daysAgo(dateStr) {
  const d = new Date(dateStr)
  return isNaN(d) ? 9999 : Math.round((Date.now() - d.getTime()) / 86400000)
}

// ── PREP: bundle evidence for stocks with material new info ──
function prep() {
  const portfolio = read('portfolio.json')
  const news      = read('news.json')
  const signals   = (() => { try { return read('signals.json') } catch { return {} } })()
  const brain     = read('brain-index.json')

  const flaggedSet = new Set(signals.flagged ?? [])
  const evidence = {}
  let reviewed = 0

  for (const sym of INGEST_SYMS) {
    const holding = portfolio.holdings.find(h => h.sym === sym)
    if (!holding) continue

    const stockNews = news.stocks?.[sym] ?? { headlines: [], ratingSignals: [] }
    const material = stockNews.headlines.filter(h =>
      ['results', 'rating', 'order'].includes(h.type) && daysAgo(h.date) <= LOOKBACK
    )
    const isFlagged = flaggedSet.has(sym)

    if (material.length === 0 && !isFlagged) continue

    const brainEntry = getBrainEntry(brain, sym)
    const dims = brainEntry ? parseDimensions(brainEntry.convictionBreakdown) : null

    evidence[sym] = {
      name:         holding.name,
      bucket:       holding.bucket,
      currentConv:  holding.conv,
      ltp:          holding.ltp,
      dims,
      flaggedSignal: isFlagged,
      reasons:      [
        ...(material.length ? [`${material.length} material headline(s) in ${LOOKBACK}d`] : []),
        ...(isFlagged ? ['delta signal flagged'] : []),
      ],
      recentNews:   material.map(h => ({ date: h.date, type: h.type, title: h.title, source: h.source })),
      ratingSignals: (stockNews.ratingSignals ?? []).filter(r => daysAgo(r.date) <= LOOKBACK),
    }
    reviewed++
  }

  const out = { generatedAt: new Date().toISOString(), lookbackDays: LOOKBACK, today, stocks: evidence }
  write('rescore-evidence.json', out)

  console.log(`\nConviction re-score — PREP (${today}, ${LOOKBACK}d lookback)`)
  console.log(`  Stocks flagged for review: ${reviewed}`)
  for (const [sym, e] of Object.entries(evidence)) {
    console.log(`    ${sym.padEnd(12)} conv ${String(e.currentConv).padEnd(4)} · ${e.reasons.join(', ')}`)
  }
  if (reviewed === 0) {
    console.log('  Nothing material — no re-score needed.')
  } else {
    console.log(`\n  → Evidence written to src/data/rescore-evidence.json`)
    console.log(`  → Next: Claude reads it, writes decisions to src/data/rescore-decisions.json, then run --apply`)
  }
}

// ── APPLY: ingest Claude's decisions, update conv + log + digest ──
function apply() {
  let decisions
  try {
    decisions = read('rescore-decisions.json')
  } catch {
    console.error('No src/data/rescore-decisions.json found. Claude must write decisions first.')
    process.exit(1)
  }

  const portfolio = read('portfolio.json')
  const memory    = read('memory.json')
  if (!Array.isArray(memory.convictionLog)) memory.convictionLog = []

  const changes = []
  for (const d of decisions.decisions ?? []) {
    const holding = portfolio.holdings.find(h => h.sym === d.sym)
    if (!holding) { console.log(`  ⚠  ${d.sym} not in portfolio — skipping`); continue }

    const from = holding.conv
    const to   = d.to
    if (from === to) { console.log(`  •  ${d.sym} unchanged at ${to}`); continue }

    const direction = to > from ? 'up' : 'down'
    holding.conv = to

    const n = (memory.convictionLog.filter(c => c.sym === d.sym).length) + 1
    const entry = {
      id: `conv-${d.sym}-${n}`,
      sym: d.sym,
      from, to, direction,
      reason: d.reason,
      date: d.date ?? today,
      priceAtChange: d.priceAtChange ?? holding.ltp ?? null,
    }
    memory.convictionLog.push(entry)
    changes.push(entry)
    console.log(`  ${direction === 'up' ? '▲' : '▼'}  ${d.sym}: ${from} → ${to}  (${d.reason.slice(0, 60)}…)`)
  }

  const digest = {
    generatedAt: new Date().toISOString(),
    weekOf: today,
    changes,
    reviewed: (decisions.decisions ?? []).map(d => d.sym),
    summary: changes.length
      ? `${changes.length} conviction move${changes.length > 1 ? 's' : ''}: ` +
        changes.map(c => `${c.sym} ${c.from}→${c.to}`).join(', ')
      : 'No conviction changes this cycle.',
  }

  write('portfolio.json', portfolio)
  write('memory.json', memory)
  write('conviction-digest.json', digest)

  console.log(`\nConviction re-score — APPLY (${today})`)
  console.log(`  ${digest.summary}`)
  if (!DRY_RUN) console.log(`  → portfolio.json, memory.json, conviction-digest.json updated`)
  else console.log(`  [dry-run] no files written`)
}

if (MODE === 'apply') apply()
else prep()
