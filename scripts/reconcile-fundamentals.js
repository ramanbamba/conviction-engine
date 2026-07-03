#!/usr/bin/env node
/**
 * reconcile-fundamentals.js — the machine-vs-analyst cross-check.
 *
 * Runs fundamentalsEngine.gradeStock() over every scraped raw record and diffs the
 * objective computed grade against the curated hand grade in fundamentals.json.
 * Divergences ≥2 notches are where the thesis needs a hard second look — either the
 * numbers moved or the hand grade is carrying conviction the fundamentals don't support.
 *
 * Run: node scripts/reconcile-fundamentals.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { gradeStock } from '../src/lib/fundamentalsEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const D = path.join(__dirname, '..', 'src', 'data')
const raw = JSON.parse(fs.readFileSync(path.join(D, 'fundamentals-raw.json'), 'utf8'))
const curated = JSON.parse(fs.readFileSync(path.join(D, 'fundamentals.json'), 'utf8'))
const cur = curated.stocks || curated
const ORDER = { A: 5, B: 4, C: 3, D: 2, F: 1 }
// hand grades use +/- modifiers (A-, C+); compare on the base letter only
const base = g => ORDER[String(g).charAt(0)]

const rows = []
for (const [sym, d] of Object.entries(raw.stocks)) {
  const g = gradeStock(d)
  const c = cur[sym]
  const diff = c ? base(g.grade) - base(c.grade) : null
  rows.push({ sym, comp: g.grade, score: g.score, hand: c?.grade ?? '—', d: diff, flags: g.redFlags })
}
rows.sort((a, b) => (Math.abs(b.d ?? 0)) - (Math.abs(a.d ?? 0)) || b.score - a.score)

console.log('\n  SYM         COMP(score) HAND   Δ   red flags')
console.log('  ' + '─'.repeat(78))
for (const r of rows) {
  const mark = r.d == null ? '' : Math.abs(r.d) >= 2 ? '  ← DIVERGE' : r.d !== 0 ? '  •' : ''
  console.log(`  ${r.sym.padEnd(11)} ${(r.comp + '(' + r.score + ')').padEnd(10)} ${r.hand.padEnd(4)} ${String(r.d ?? '—').padStart(3)}   ${r.flags.join('; ') || '—'}${mark}`)
}
const div = rows.filter(r => r.d != null && Math.abs(r.d) >= 2)
const missing = rows.filter(r => r.hand === '—')
console.log('\n  Divergences ≥2 notches:', div.length ? div.map(r => `${r.sym}(${r.comp}vs${r.hand})`).join(', ') : 'none')
if (missing.length) console.log('  No hand grade yet:', missing.map(r => r.sym).join(', '))
console.log('')
