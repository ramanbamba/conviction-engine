#!/usr/bin/env node
/**
 * regression.js — the safety net that makes engine work safe.
 *
 * Snapshots what the analytical engines say about every known name
 * (fundamentals grade + alpha score/tier/gates) and diffs against a committed
 * baseline. ANY delta fails the run — an engine change must either produce
 * zero deltas or the executor re-baselines with every delta explained in the
 * commit message. See EVOLUTION_PLAYBOOK.md — GATED files may only change
 * behind this harness.
 *
 *   npm run regress            compare current engines vs baseline (exit 1 on delta)
 *   npm run regress:baseline   rewrite the baseline (do this ONLY with explained deltas)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { gradeStock } from '../src/lib/fundamentalsEngine.js'
import { alphaModel } from '../src/lib/alphaModel.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const D = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', f), 'utf8'))
const BASELINE = path.join(ROOT, 'scripts', 'regression-baseline.json')
const WRITE = process.argv.includes('--baseline')

const raw = D('fundamentals-raw.json')
const portfolio = D('portfolio.json')
const fundamentals = D('fundamentals.json')
const insights = D('insights.json')
const ai = D('ai-insights.json')

// 1. Fundamentals grades — every name we have raw data for
const grades = {}
for (const [sym, r] of Object.entries(raw.stocks ?? raw)) {
  const g = gradeStock(r)
  if (g) grades[sym] = { grade: g.grade, score: g.score, redFlags: (g.redFlags || []).length }
}

// 2. Alpha model — every held name
const alpha = {}
for (const h of portfolio.holdings) {
  const m = alphaModel({
    fundamentals: fundamentals?.stocks?.[h.sym],
    technicals: insights?.positions?.[h.sym]?.computedTechnicals,
    ltp: h.ltp, theme: h.theme,
    auditSeverity: ai?.earningsAudit?.stocks?.[h.sym]?.severity,
    sectorRotation: ai?.sectorRotation,
  })
  if (m) alpha[h.sym] = { score: m.score, tier: m.tier, gov: +m.gates.gov.toFixed(2), eq: +m.gates.eq.toFixed(2) }
}

const current = { grades, alpha }

if (WRITE) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
  console.log(`regression: baseline written — ${Object.keys(grades).length} grades, ${Object.keys(alpha).length} alpha rows`)
  process.exit(0)
}

if (!fs.existsSync(BASELINE)) {
  console.error('regression: no baseline. Run `npm run regress:baseline` on a known-good tree first.')
  process.exit(1)
}
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))

const deltas = []
for (const section of ['grades', 'alpha']) {
  const a = base[section] || {}, b = current[section] || {}
  for (const sym of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const from = JSON.stringify(a[sym]) ?? 'ABSENT', to = JSON.stringify(b[sym]) ?? 'ABSENT'
    if (from !== to) deltas.push(`  ${section}.${sym}: ${from} → ${to}`)
  }
}

if (deltas.length) {
  console.error(`regression: ${deltas.length} delta(s) vs baseline:`)
  deltas.forEach(d => console.error(d))
  console.error('\nIf every delta is intended and explained, re-baseline: npm run regress:baseline')
  process.exit(1)
}
console.log(`regression: GREEN — ${Object.keys(grades).length} grades + ${Object.keys(alpha).length} alpha rows match baseline`)
