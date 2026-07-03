#!/usr/bin/env node
/**
 * run-opportunity-radar.js — PHASE 19 Sprint D: the final synthesis.
 *
 * Grades the Stage 2 fundamentals scrape (universe-fundamentals-raw.json) through
 * the SAME fundamentalsEngine.gradeStock() used for the 35 holdings, then runs
 * the SAME alphaModel() (the core IP, unmodified — see ALPHA_MODEL.md) over each
 * shortlist name using Stage 1's technicals. Writes the final ranked opportunity
 * list to src/data/opportunity-radar.json — external candidates the model likes,
 * that you don't already own.
 *
 * Pipeline: fetch-universe -> screen-universe -> fetch-universe-fundamentals -> (this)
 * Run: npm run universe:radar
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { gradeStock, FINANCIALS } from '../src/lib/fundamentalsEngine.js'
import { alphaModel } from '../src/lib/alphaModel.js'

/**
 * Structural-distress check — a known blind spot in fundamentalsEngine's gates:
 * cfoQuality() silently returns null (no penalty) when cumulative PAT is
 * negative, and debtTrend() can read "improving" off a base year that's
 * already mid-explosion. Caught on IDEA (Vodafone Idea) in Sprint D's first
 * run: negative book value + a 9x multi-year debt run-up scored POSITIVE with
 * clean gates. Flag it explicitly here rather than trust the pillars blind —
 * fixing the shared engine itself needs its own regression pass across all 35
 * held names, tracked separately (BACKLOG.md).
 */
function structuralDistressFlags(raw) {
  const flags = []
  if (raw.snapshot?.bookValue != null && raw.snapshot.bookValue < 0) flags.push('negative book value')
  const pat = raw.series?.netProfit
  if (Array.isArray(pat) && pat.length >= 4) {
    const sum6 = pat.slice(-6).reduce((a, b) => a + b, 0)
    if (sum6 < 0) flags.push('cumulative losses (6y PAT < 0)')
  }
  // NOTE: raw debt-multiple growth was tried and dropped — false-positived on
  // 15/25 names (healthy companies scale borrowings with revenue). Negative
  // book value + cumulative losses are the two signals precise enough to act
  // on without a human read; caught IDEA alone in testing.
  return flags
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const D = path.join(ROOT, 'src/data')

const technicalsData = JSON.parse(fs.readFileSync(path.join(D, 'universe-technicals.json'), 'utf8'))
const fundamentalsRaw = JSON.parse(fs.readFileSync(path.join(D, 'universe-fundamentals-raw.json'), 'utf8'))
const aiInsights = JSON.parse(fs.readFileSync(path.join(D, 'ai-insights.json'), 'utf8'))

// These universe names are banks — grade on the financials rail (ROE, not
// ROCE/CFO/debt, which are meaningless for a lender). FINANCIALS is a shared
// Set from the core engine; extending it in-place (not editing the engine
// file) is the surgical way to fix a real gap without touching change-controlled IP.
;['AXISBANK', 'INDUSINDBK', 'AUBANK'].forEach(s => FINANCIALS.add(s))

const techBySym = Object.fromEntries(technicalsData.rows.map(r => [r.sym, r]))

const results = []
for (const sym of technicalsData.shortlist) {
  const raw = fundamentalsRaw.stocks[sym]
  const tech = techBySym[sym]
  if (!raw || !tech) continue

  const graded = gradeStock(raw)
  if (!graded) continue

  const computed = {
    grade: graded.grade, score: graded.score, sector: graded.sector, pillars: graded.pillars,
    quarterly: raw.quarterly ?? null, redFlags: graded.redFlags, metrics: graded.metrics,
    snapshot: { pe: raw.snapshot.pe, roce: raw.snapshot.roce, roe: raw.snapshot.roe, pledge: raw.ownership?.pledgePct ?? 0, promoter: raw.ownership?.promoterPct ?? null },
    asOf: raw.asOf,
  }

  // Stage 1 now persists the exact absolute levels (sma50/200, 52w hi/lo, support)
  // alongside the derived percentages — feed technicalScore() the real numbers,
  // not an approximation.
  const ltp = tech.ltp
  const technicalsForModel = {
    sma50: tech.sma50, sma200: tech.sma200, rsi14: tech.rsi14,
    fiftyTwoWeekHigh: tech.fiftyTwoWeekHigh, fiftyTwoWeekLow: tech.fiftyTwoWeekLow,
    support: tech.support,
  }

  const model = alphaModel({
    fundamentals: { computed },
    technicals: technicalsForModel,
    ltp,
    theme: tech.industry,
    auditSeverity: null, // no hand-curated audit for external names; cash-quality gate still applies from real CFO/PAT data
    sectorRotation: aiInsights.sectorRotation,
  })
  if (!model) continue

  const distressFlags = structuralDistressFlags(raw)
  results.push({
    sym, name: tech.name, industry: tech.industry, ltp,
    stage1Score: tech.stage1Score, sectorPhase: tech.sectorPhase,
    model, redFlags: graded.redFlags, grade: graded.grade,
    pledge: raw.ownership?.pledgePct ?? 0, promoter: raw.ownership?.promoterPct ?? null,
    pe: raw.snapshot.pe, roce: raw.snapshot.roce, roe: raw.snapshot.roe,
    distressFlags, distressed: distressFlags.length > 0,
  })
}

// Distressed names sort to the bottom regardless of model score — a known
// gate blind spot means their score cannot be trusted at face value.
results.sort((a, b) => (a.distressed !== b.distressed ? (a.distressed ? 1 : -1) : b.model.score - a.model.score))

const out = {
  asOf: new Date().toISOString().split('T')[0],
  universeSize: technicalsData.universeSize,
  shortlistSize: technicalsData.shortlist.length,
  graded: results.length,
  rows: results,
}
fs.writeFileSync(path.join(D, 'opportunity-radar.json'), JSON.stringify(out, null, 2) + '\n')

console.log(`\nOpportunity Radar — ${results.length} names scored (of ${technicalsData.shortlist.length} shortlisted)\n`)
results.forEach((r, i) => {
  const g = (r.model.gates.gov * r.model.gates.eq).toFixed(2)
  const warn = r.distressed ? `  ⚠ DISTRESS: ${r.distressFlags.join('; ')}` : ''
  console.log(`  ${String(i + 1).padStart(2)}. ${r.sym.padEnd(13)} score=${String(r.model.score).padStart(3)} ${r.model.tier.padEnd(8)} grade=${r.grade ?? '—'}  gate=${g}  pledge=${r.pledge}%  P/E=${r.pe ?? '—'}  ROCE/ROE=${r.roce ?? r.roe ?? '—'}${warn}`)
})
console.log(`\nWrote: ${path.join(D, 'opportunity-radar.json')}`)
