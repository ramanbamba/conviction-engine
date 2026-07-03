/**
 * morning.js
 *
 * Morning data sync — runs the full intelligence pipeline in sequence:
 *   1. npm run calendar  → upcoming board meetings / results dates
 *   2. npm run actions   → upcoming dividends, splits, bonuses
 *   3. npm run signals   → delta signals vs last portfolio snapshot
 *
 * Usage:
 *   npm run morning
 *   npm run morning -- --dry-run
 *
 * After this runs, open the app — cockpit, catalysts, and signals are
 * fully refreshed. Then say "run weekly insights" in Claude Code if needed.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.join(__dirname, '..')

const DRY_RUN = process.argv.includes('--dry-run')
const today   = new Date().toISOString().split('T')[0]

const STEPS = [
  { name: 'NSE Board Meetings / Results', cmd: 'node scripts/fetch-nse-calendar.js' },
  { name: 'NSE Corporate Actions',        cmd: 'node scripts/fetch-nse-actions.js'  },
  { name: 'Stock News (Google RSS)',      cmd: 'node scripts/fetch-news.js'         },
  { name: 'Filings Date Repair',          cmd: 'node scripts/fix-filings-dates.js'  },
  { name: 'Delta Signals',               cmd: 'node scripts/detect-signals.js'     },
  { name: 'PM Loop (tape recorder)',      cmd: 'node scripts/close-pm-loop.js'      },
  { name: 'Alpha Snapshot (model tape)',  cmd: 'node scripts/snapshot-alpha.js'     },
]

function banner(text, char = '─') {
  const width = 54
  const pad   = Math.max(0, width - text.length - 2)
  const left  = Math.floor(pad / 2)
  const right = pad - left
  console.log(`\n${char.repeat(left)} ${text} ${char.repeat(right)}`)
}

function run(cmd, dryRun) {
  const full = dryRun ? `${cmd} --dry-run` : cmd
  execSync(full, { stdio: 'inherit', cwd: ROOT })
}

banner(`Morning Sync — ${today}`, '═')
console.log(DRY_RUN ? ' [DRY RUN — no files will be written]\n' : '')

// Warn if portfolio prices are stale (not refreshed today)
try {
  const portfolio = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/portfolio.json'), 'utf8'))
  const refreshDate = portfolio.meta?.refreshDate
  if (refreshDate && refreshDate < today) {
    console.log(`  ⚠  Prices stale (last refresh: ${refreshDate}) — run \`npm run refresh\` first for accurate signals\n`)
  }
} catch {}

const results = []

for (const step of STEPS) {
  banner(step.name)
  const t0 = Date.now()
  try {
    run(step.cmd, DRY_RUN)
    results.push({ name: step.name, ok: true, ms: Date.now() - t0 })
  } catch (err) {
    results.push({ name: step.name, ok: false, ms: Date.now() - t0 })
    console.error(`\nStep failed: ${step.name}`)
  }
}

// Final summary
banner('Summary', '═')
for (const r of results) {
  const icon = r.ok ? '✓' : '✗'
  console.log(`  ${icon}  ${r.name.padEnd(34)} ${(r.ms / 1000).toFixed(1)}s`)
}

// Pull key stats from freshly-written files
try {
  const aiInsights = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ai-insights.json'), 'utf8'))
  const signals    = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/signals.json'), 'utf8'))

  const upcoming = (aiInsights.catalystAlerts ?? []).filter(a => a.date >= today)
  const caCount  = upcoming.filter(a => a.source === 'nse-ca-auto').length
  const bmCount  = upcoming.filter(a => a.source === 'nse-auto').length
  const flagged  = signals.flagged?.length ?? 0

  console.log(`\n  Board meetings / results: ${bmCount}`)
  console.log(`  Corporate actions:        ${caCount}`)
  console.log(`  Flagged stocks:           ${flagged}`)
  if (flagged > 0) {
    console.log(`  → ${signals.flagged.join(', ')}`)
  }
} catch {}

console.log(`\n  App: http://localhost:5173  (or Vercel prod)\n`)

if (!results.every(r => r.ok)) {
  process.exit(1)
}
