#!/usr/bin/env node
/**
 * build-fundamentals.js — Phase 15.4: raw → graded overlay.
 *
 * Runs fundamentalsEngine.gradeStock() over every scraped record and writes the
 * objective result into fundamentals.json as a per-stock `computed` block. The
 * curated hand grade/verdict/conviction stay untouched as the analyst overlay —
 * the dossier shows both, and flags where they diverge.
 *
 * Pipeline: npm run fundamentals  →  npm run fundamentals:grade
 * (scrape ~quarterly / on results; re-grade is instant and free.)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { gradeStock } from '../src/lib/fundamentalsEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const D = path.join(__dirname, '..', 'src', 'data')
const rawPath = path.join(D, 'fundamentals-raw.json')
const curPath = path.join(D, 'fundamentals.json')

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'))
const cur = JSON.parse(fs.readFileSync(curPath, 'utf8'))
cur.stocks = cur.stocks || {}
cur.computedAt = new Date().toISOString().split('T')[0]

let n = 0
for (const [sym, d] of Object.entries(raw.stocks)) {
  const g = gradeStock(d)
  if (!g) continue
  const entry = cur.stocks[sym] || {}
  entry.computed = {
    grade: g.grade,
    score: g.score,
    sector: g.sector,
    pillars: g.pillars,
    quarterly: d.quarterly ?? null,   // last 8 quarters {labels, sales, opmPct, netProfit}
    redFlags: g.redFlags,
    metrics: g.metrics,
    snapshot: {            // the few raw numbers the tearsheet shows inline
      pe: d.snapshot.pe, roce: d.snapshot.roce, roe: d.snapshot.roe,
      pledge: d.ownership?.pledgePct ?? 0, promoter: d.ownership?.promoterPct ?? null,
    },
    asOf: d.asOf ?? null,
  }
  cur.stocks[sym] = entry
  n++
}

fs.writeFileSync(curPath, JSON.stringify(cur, null, 2) + '\n')
console.log(`\n  Graded ${n} stocks → fundamentals.json (computed overlay)\n`)
