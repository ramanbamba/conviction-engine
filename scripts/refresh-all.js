/**
 * refresh-all.js — the unified refresh orchestrator.
 *
 * One master refresh + composable sub-refreshes over a single step registry.
 *
 *   npm run refresh                 → master: the full chain, in order
 *   npm run refresh:portfolio       → just Kite → portfolio.json
 *   npm run refresh:news            → just news
 *   npm run refresh:conviction      → just the conviction re-score (Claude)
 *   node scripts/refresh-all.js data        → the public-data group (cron-safe)
 *   node scripts/refresh-all.js news signals → any combination
 *   node scripts/refresh-all.js --dry-run
 *
 * Step metadata:
 *   needs: 'kite'   → skipped if the Kite feed files aren't present
 *   needs: 'claude' → needs an LLM; skipped in plain shell with a note to run
 *                     it inside Claude Code (or via the scheduled Claude agent)
 *   flaky: 'nse'    → non-fatal (NSE APIs block datacenter IPs)
 */

import { execSync } from 'child_process'
import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const DRY_RUN = process.argv.includes('--dry-run')
const today   = new Date().toISOString().split('T')[0]

// ── Step registry (master order) ──
const STEPS = {
  portfolio:  { label: 'Portfolio (Kite holdings/positions)', cmd: 'node scripts/refresh.js',                 needs: 'kite'   },
  technicals: { label: 'Technicals (SMA/RSI/52w)',            cmd: 'node scripts/refresh-technicals-yahoo.js'                 },
  news:       { label: 'Stock news (Google RSS)',            cmd: 'node scripts/fetch-news.js'                               },
  filings:    { label: 'Filings date repair',                cmd: 'node scripts/fix-filings-dates.js'                        },
  calendar:   { label: 'NSE board meetings / results',       cmd: 'node scripts/fetch-nse-calendar.js',       flaky: 'nse'    },
  actions:    { label: 'NSE corporate actions',              cmd: 'node scripts/fetch-nse-actions.js',        flaky: 'nse'    },
  benchmark:  { label: 'Benchmark / alpha (Nifty)',          cmd: 'node scripts/fetch-benchmark.js'                          },
  signals:    { label: 'Delta signals',                      cmd: 'node scripts/detect-signals.js'                           },
  conviction: { label: 'Conviction re-score',                cmd: 'node scripts/rescore-conviction.js',       needs: 'claude' },
  insights:   { label: 'AI insights',                        cmd: 'node scripts/tiered-insights.js',          needs: 'claude' },
  brain:      { label: 'Brain index rebuild',                cmd: 'node scripts/build-brain-index.js'                        },
}

// Master order — the full chain
const MASTER = ['portfolio', 'technicals', 'news', 'filings', 'calendar', 'actions', 'benchmark', 'signals', 'conviction', 'insights', 'brain']

// Named groups
const GROUPS = {
  all:     MASTER,
  data:    ['news', 'filings', 'calendar', 'actions', 'benchmark', 'signals'], // cron-safe, no auth/LLM
  market:  ['portfolio', 'technicals', 'benchmark'],                            // price/quote layer
  brainal: ['conviction', 'insights', 'brain'],                                 // the LLM/analysis layer
}

function banner(text, char = '─') {
  const width = 56
  const pad = Math.max(0, width - text.length - 2)
  const l = Math.floor(pad / 2)
  console.log(`\n${char.repeat(l)} ${text} ${char.repeat(pad - l)}`)
}

function kiteFeedsPresent() {
  return fs.existsSync(path.join(ROOT, 'data/kite/holdings.json'))
      && fs.existsSync(path.join(ROOT, 'data/kite/positions.json'))
}

function hasClaudeKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function scriptExists(cmd) {
  const m = cmd.match(/node\s+(\S+)/)
  return m ? fs.existsSync(path.join(ROOT, m[1])) : true
}

// ── Resolve which steps to run from argv ──
function resolveTargets(argv) {
  const args = argv.filter(a => !a.startsWith('--'))
  if (args.length === 0) return MASTER
  const out = []
  for (const a of args) {
    const key = a.toLowerCase()
    if (GROUPS[key]) out.push(...GROUPS[key])
    else if (STEPS[key]) out.push(key)
    else console.log(`  ⚠  Unknown target "${a}" — skipping`)
  }
  // Dedupe, preserve master order
  return MASTER.filter(k => out.includes(k))
}

function main() {
  const targets = resolveTargets(process.argv.slice(2))

  banner(`Refresh — ${today}${DRY_RUN ? ' [DRY RUN]' : ''}`, '═')
  console.log(`  Steps: ${targets.join(' → ')}\n`)

  const results = []

  for (const key of targets) {
    const step = STEPS[key]
    banner(step.label)

    // Skip gates
    if (step.needs === 'kite' && !kiteFeedsPresent()) {
      console.log('  ⏭  Skipped — no Kite feed (pull holdings/positions via Kite MCP first)')
      results.push({ key, status: 'skipped', reason: 'no kite feed' })
      continue
    }
    if (step.needs === 'claude' && !scriptExists(step.cmd)) {
      console.log('  ⏭  Skipped — script not built yet (Phase 10.4)')
      results.push({ key, status: 'skipped', reason: 'not built' })
      continue
    }
    if (step.needs === 'claude' && !hasClaudeKey()) {
      console.log('  ⏭  Needs Claude — run `refresh ' + key + '` inside Claude Code, or let the scheduled agent handle it')
      results.push({ key, status: 'deferred', reason: 'claude' })
      continue
    }

    const t0 = Date.now()
    try {
      execSync(DRY_RUN ? `${step.cmd} --dry-run` : step.cmd, { stdio: 'inherit', cwd: ROOT })
      results.push({ key, status: 'ok', ms: Date.now() - t0 })
    } catch (err) {
      const fatal = !step.flaky
      results.push({ key, status: fatal ? 'failed' : 'flaky-fail', ms: Date.now() - t0 })
      if (step.flaky) console.log(`\n  ⚠  ${step.label} failed (${step.flaky}) — non-fatal, continuing`)
      else console.error(`\n  ✗  ${step.label} failed`)
    }
  }

  // ── Summary ──
  banner('Summary', '═')
  const icon = { ok: '✓', skipped: '⏭', deferred: '◷', failed: '✗', 'flaky-fail': '⚠' }
  for (const r of results) {
    const t = r.ms != null ? `${(r.ms / 1000).toFixed(1)}s` : (r.reason ?? '')
    console.log(`  ${icon[r.status]}  ${STEPS[r.key].label.padEnd(38)} ${t}`)
  }

  const deferred = results.filter(r => r.status === 'deferred').map(r => r.key)
  if (deferred.length) {
    console.log(`\n  ◷  Run inside Claude Code:  ${deferred.map(k => `refresh ${k}`).join('  ·  ')}`)
  }
}

main()
