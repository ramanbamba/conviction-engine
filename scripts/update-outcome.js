/**
 * update-outcome.js
 *
 * Log a post-event outcome against a decisionLedger entry.
 * Reads memory.json, fills in the outcome block, writes back.
 *
 * Usage (via Claude Code):
 *   node scripts/update-outcome.js \
 *     --id decision-HAL-catalystNear-20260508 \
 *     --ltp 5200 \
 *     --revenue 5800 \
 *     --pat 1720 \
 *     --guidance "FY27 strong, AMCA confirmed" \
 *     --conv 8.5 \
 *     --notes "Beat on all metrics. Thesis validated."
 *
 * Or say to Claude Code:
 *   "Log HAL Q4 outcome: LTP ₹5,200, revenue ₹5,800cr, PAT ₹1,720cr, guidance strong"
 *   Claude Code will call this script with the right args.
 *
 * Verdict thresholds (vs avgAtEntry):
 *   >= +8%  → STRONG
 *   >= 0%   → OK
 *   >= -8%  → MISS
 *   < -8%   → DISASTER
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEMORY_PATH = path.join(__dirname, '..', 'src', 'data', 'memory.json')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      args[key] = argv[i + 1] ?? true
      i++
    }
  }
  return args
}

function verdict(returnPct) {
  if (returnPct >= 8)  return 'STRONG'
  if (returnPct >= 0)  return 'OK'
  if (returnPct >= -8) return 'MISS'
  return 'DISASTER'
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.id) {
    console.error('Error: --id is required (the decisionLedger entry id)')
    console.error('Run: node scripts/update-outcome.js --id <id> --ltp <price> [--revenue N] [--pat N] [--guidance "..."] [--conv N] [--notes "..."]')
    process.exit(1)
  }

  const memory = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'))

  if (!memory.decisionLedger) {
    console.error('No decisionLedger found in memory.json')
    process.exit(1)
  }

  const entry = memory.decisionLedger.find(e => e.id === args.id)
  if (!entry) {
    console.error(`Entry "${args.id}" not found in decisionLedger`)
    console.error('Available entries:', memory.decisionLedger.map(e => e.id).join(', '))
    process.exit(1)
  }

  if (entry.outcome) {
    console.warn(`Warning: entry "${args.id}" already has an outcome. Overwriting.`)
  }

  const ltp = parseFloat(args.ltp)
  if (isNaN(ltp)) {
    console.error('Error: --ltp must be a number (current price after event)')
    process.exit(1)
  }

  const returnPct = ((ltp - entry.avgAtEntry) / entry.avgAtEntry) * 100
  const alphaPnL  = Math.round((ltp - entry.avgAtEntry) * entry.qtyAtEntry)

  entry.outcome = {
    loggedAt:    new Date().toISOString(),
    ltpAtOutcome: ltp,
    returnPct:   Math.round(returnPct * 100) / 100,
    alphaPnL,
    verdict:     verdict(returnPct),
    resultData: {
      revenue:   args.revenue  ? parseFloat(args.revenue)  : null,
      pat:       args.pat      ? parseFloat(args.pat)      : null,
      guidance:  args.guidance ?? null,
      notes:     args.notes    ?? null,
    },
    convChange:    args.conv   ? parseFloat(args.conv) : null,
    thesisUpdate:  args.thesis ?? null,
  }

  fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2))

  console.log(`\n✓ Outcome logged for ${entry.sym} (${entry.eventLabel})`)
  console.log(`  Entry price: ₹${entry.avgAtEntry.toLocaleString('en-IN')}`)
  console.log(`  LTP now:     ₹${ltp.toLocaleString('en-IN')}`)
  console.log(`  Return:      ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`)
  console.log(`  Alpha P&L:   ${alphaPnL >= 0 ? '+' : ''}₹${Math.abs(alphaPnL).toLocaleString('en-IN')}`)
  console.log(`  Verdict:     ${entry.outcome.verdict}`)
  if (args.conv) console.log(`  Conv update: ${entry.convAtEntry} → ${args.conv}`)
  console.log()
}

main()
