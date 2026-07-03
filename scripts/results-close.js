/**
 * results-close.js
 *
 * Closes the loop the Results Desk opens: every held name that prints ends in either
 * a fresh underwrite (BEAT/INLINE) or an exit ticket (MISS/THESIS_BREAK) — no name
 * survives the season by default. Reads the verdict already logged in
 * results-desk.json (via the "verdict [SYM]" ritual).
 *
 * Usage:
 *   npm run results:close -- --stock SYM
 *   node scripts/results-close.js --stock SYM [--dry-run]
 *
 * Mapping (draft severity — a proposal for the user to ratify/veto in the PM tab,
 * never an executed trade):
 *   THESIS_BREAK → CUT  (full-exit draft — thesis proven wrong)
 *   MISS         → TRIM (partial-reduction draft, unsized — numbers missed but thesis
 *                        not necessarily broken; sizing is a human call, not this script's)
 *   BEAT/INLINE  → requires stocks[SYM].reUnderwrite = {thesis3Lines, conv, asOf}
 *                  already present, else prints exactly what's missing and exits 1.
 *
 * Emits into pm-brief.json.decisions in the exact shape scripts/pm-brief.js writes
 * (id/tier/type/syms/size/title/rationale/rearviewNote/ticket/confidence) so
 * PMTab.jsx renders it unchanged, plus a matching memory.json.pmLedger entry so
 * ratify/veto work. Idempotent — re-running for the same stock/day is a no-op.
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const D = f => path.join(__dirname, '..', 'src', 'data', f)
const read = f => JSON.parse(fs.readFileSync(D(f), 'utf8'))
const readOpt = (f, fallback) => { try { return read(f) } catch { return fallback } }

const ARGV = process.argv.slice(2)
const DRY = ARGV.includes('--dry-run')
const stockIdx = ARGV.indexOf('--stock')
const SYM = stockIdx !== -1 ? ARGV[stockIdx + 1] : null

const today = new Date().toISOString().split('T')[0]
const write = (f, obj) => { if (!DRY) fs.writeFileSync(D(f), JSON.stringify(obj, null, 2)) }

function closeReUnderwrite(entry) {
  if (!entry.reUnderwrite) {
    console.log(`\n⚠ ${SYM} — ${entry.verdict.call}, but not re-underwritten yet.`)
    console.log(`  Missing: stocks.${SYM}.reUnderwrite = { thesis3Lines, conv, asOf }`)
    console.log(`  A beat/inline print doesn't survive the season for free — write the fresh 3-line thesis + conviction, then re-run.`)
    process.exit(1)
  }
  console.log(`\n✓ ${SYM} — ${entry.verdict.call}, re-underwritten ${entry.reUnderwrite.asOf} (conv ${entry.reUnderwrite.conv}). Closed.`)
}

function closeExitTicket(entry) {
  const portfolio = read('portfolio.json')
  const holding = portfolio.holdings.find(h => h.sym === SYM)
  if (!holding) {
    console.error(`${SYM} not found in portfolio.json holdings.`)
    process.exit(1)
  }

  const type = entry.verdict.call === 'THESIS_BREAK' ? 'CUT' : 'TRIM'
  const id = `pm-${type}-${SYM}-${today.replace(/-/g, '')}`

  const pmBrief = readOpt('pm-brief.json', { decisions: [] })
  if ((pmBrief.decisions || []).some(d => d.id === id)) {
    console.log(`\n${SYM} — ${type} decision already drafted today (${id}). Nothing to do.`)
    return
  }

  const ticket = type === 'CUT'
    ? { side: 'SELL', sym: SYM, qty: holding.qty, limitHint: holding.ltp ? `≥ ₹${holding.ltp}` : 'market', note: 'draft — results desk close' }
    : { side: 'SELL', sym: SYM, qty: null, limitHint: holding.ltp ? `≥ ₹${holding.ltp}` : 'market', note: 'draft — size in Kite, results desk close' }

  const decision = {
    id,
    tier: 'decision',
    type,
    syms: [SYM],
    size: type === 'CUT' ? Math.round(holding.qty * (holding.ltp || 0)) : null,
    title: type === 'CUT' ? `Exit ${SYM} — ${entry.verdict.call} on results` : `Trim ${SYM} — ${entry.verdict.call} on results`,
    rationale: entry.verdict.note || `Q1FY27 print: ${entry.verdict.call}. Results Desk close.`,
    rearviewNote: null,
    ticket,
    confidence: 'low',
  }

  const finalBrief = {
    ...pmBrief,
    decisions: [...(pmBrief.decisions || []), decision],
    stance: 'ACTION_WARRANTED',
    standPatReason: null,
    streak: { standPatDays: 0 },
  }
  write('pm-brief.json', finalBrief)

  const memory = read('memory.json')
  if (!Array.isArray(memory.pmLedger)) memory.pmLedger = []
  if (!memory.pmLedger.some(x => x.id === id)) {
    memory.pmLedger.push({
      id, type, syms: [SYM], size: decision.size,
      proposedAt: today, response: 'PENDING', respondedAt: null, snoozeUntil: null,
      rationale: decision.rationale,
    })
    write('memory.json', memory)
  }

  console.log(`\n✗ ${SYM} — ${entry.verdict.call}. Draft ${type} decision emitted → pm-brief.json (${id}).`)
  if (DRY) console.log('[dry-run] No files written.')
}

function main() {
  if (!SYM) {
    console.error('Usage: npm run results:close -- --stock SYM')
    process.exit(1)
  }

  const resultsDesk = read('results-desk.json')
  const entry = resultsDesk.stocks?.[SYM]
  if (!entry) {
    console.error(`${SYM} is not in results-desk.json. Run "npm run results:prep" first.`)
    process.exit(1)
  }
  if (!entry.verdict) {
    console.error(`${SYM}: no verdict logged yet. Log it first ("verdict ${SYM}" to Claude), then re-run.`)
    process.exit(1)
  }

  const { call } = entry.verdict
  if (call === 'BEAT' || call === 'INLINE') return closeReUnderwrite(entry)
  if (call === 'MISS' || call === 'THESIS_BREAK') return closeExitTicket(entry)

  console.error(`${SYM}: unrecognized verdict.call "${call}".`)
  process.exit(1)
}

main()
