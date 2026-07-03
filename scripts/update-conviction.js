/**
 * update-conviction.js
 *
 * Single-command conviction update: portfolio.json + brain-index.json + memory.json convictionLog.
 * Keeps all three in sync — no manual surgery across files.
 *
 * Usage:
 *   npm run conviction -- --sym HAL --to 8.5 --reason "Strong Q4: revenue +18%, AMCA confirmed"
 *
 * Or just tell Claude Code: "Update HAL conviction to 8.5 — strong Q4 guidance"
 *
 * What it does:
 *   1. Reads current conv from portfolio.json (all entries for sym, handles split-bucket like MARUTI/MARUTI-PA)
 *   2. Writes new conv to portfolio.json
 *   3. Updates brain-index.json stocks[sym].conviction + actionBias (if covered)
 *   4. Appends to memory.json convictionLog[]
 *   5. Prints summary
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const PORTFOLIO_PATH   = path.join(ROOT, 'src', 'data', 'portfolio.json')
const BRAIN_PATH       = path.join(ROOT, 'src', 'data', 'brain-index.json')
const MEMORY_PATH      = path.join(ROOT, 'src', 'data', 'memory.json')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const val = argv[i + 1]
      args[key] = val && !val.startsWith('--') ? val : true
      if (val && !val.startsWith('--')) i++
    }
  }
  return args
}

function actionBiasFor(conv) {
  if (conv >= 9)  return 'STRONG_BUY'
  if (conv >= 7)  return 'BUY'
  if (conv >= 5)  return 'HOLD'
  if (conv >= 3)  return 'AVOID'
  return 'EXIT'
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.sym || !args.to || !args.reason) {
    console.error('Usage: npm run conviction -- --sym <SYM> --to <score> --reason "<reason>"')
    console.error('Example: npm run conviction -- --sym HAL --to 8.5 --reason "Strong Q4 guidance"')
    process.exit(1)
  }

  const sym    = args.sym.toUpperCase()
  const newConv = parseFloat(args.to)
  const reason  = args.reason

  if (isNaN(newConv) || newConv < 1 || newConv > 10) {
    console.error('--to must be a number between 1 and 10')
    process.exit(1)
  }

  const today = new Date().toISOString().split('T')[0]

  // ── 1. portfolio.json ──────────────────────────────────────────────────────
  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'))
  const targets   = portfolio.holdings.filter(h => h.sym === sym)

  if (targets.length === 0) {
    console.error(`"${sym}" not found in portfolio.json holdings`)
    console.error('Available syms:', portfolio.holdings.map(h => h.sym).join(', '))
    process.exit(1)
  }

  const oldConv = targets[0].conv
  const direction = newConv > oldConv ? 'up' : newConv < oldConv ? 'down' : 'unchanged'

  if (direction === 'unchanged') {
    console.log(`Conviction for ${sym} is already ${oldConv}. Nothing to update.`)
    process.exit(0)
  }

  portfolio.holdings = portfolio.holdings.map(h =>
    h.sym === sym ? { ...h, conv: newConv } : h
  )
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2))

  // ── 2. brain-index.json ────────────────────────────────────────────────────
  const brain     = JSON.parse(fs.readFileSync(BRAIN_PATH, 'utf8'))
  let brainUpdated = false

  if (brain.stocks && brain.stocks[sym]) {
    brain.stocks[sym].conviction   = newConv
    brain.stocks[sym].actionBias   = actionBiasFor(newConv)
    brain.stocks[sym].convLastUpdate = { date: today, from: oldConv, to: newConv, reason }
    brainUpdated = true

    // recalculate avgConviction
    const convs = Object.values(brain.stocks).map(s => s.conviction).filter(Boolean)
    brain.meta.avgConviction = Math.round((convs.reduce((a, b) => a + b, 0) / convs.length) * 100) / 100
    brain.meta.lastConvUpdate = today

    fs.writeFileSync(BRAIN_PATH, JSON.stringify(brain, null, 2))
  }

  // ── 3. memory.json convictionLog ───────────────────────────────────────────
  const memory  = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'))
  const holding = targets[0]

  if (!memory.convictionLog) memory.convictionLog = []

  memory.convictionLog.push({
    id:            `conv-${sym}-${Date.now()}`,
    sym,
    from:          oldConv,
    to:            newConv,
    direction,
    reason,
    date:          today,
    priceAtChange: holding.ltp ?? null,
  })

  fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2))

  // ── Summary ────────────────────────────────────────────────────────────────
  const arrow     = direction === 'up' ? '↑' : '↓'
  const biasLabel = actionBiasFor(newConv)

  console.log(`\n✓ Conviction updated: ${sym}`)
  console.log(`  ${oldConv} → ${newConv} ${arrow}  (${biasLabel})`)
  console.log(`  Reason: ${reason}`)
  console.log(`  Date:   ${today}`)
  console.log(`  Price:  ₹${(holding.ltp ?? 'unknown').toLocaleString?.('en-IN') ?? holding.ltp}`)
  if (brainUpdated) {
    console.log(`  Brain index: updated`)
  } else {
    console.log(`  Brain index: ${sym} not in brain-index.json (no brain entry to update)`)
  }
  console.log()
  console.log(`  Next: run 'npm run signals' to regenerate signals.json`)
  if (brainUpdated) {
    console.log(`        run weekly insights to propagate to ai-insights.json`)
  }
  console.log()
}

main()
