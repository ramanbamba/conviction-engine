#!/usr/bin/env node
/**
 * grade-screener.js — the prove-it loop for the Screener (Phase 20b).
 *
 * Walks screener-history.json snapshots and grades every OPEN cohort row on
 * forward price action: did the name hit +1R before −1R (1R = 2×ATR at
 * snapshot time) within 30 sessions of the snapshot?
 *
 *   WIN     — +1R touched first
 *   LOSS    — −1R touched first
 *   TIMEOUT — 30 sessions elapsed, neither touched; rMultiple = final move / R
 *   OPEN    — window still running, neither touched yet (re-graded next run)
 *
 * Writes outcomes back into screener-history.json and a cohort scorecard to
 * screener-validation.json (READY vs BASE-as-control): hit rate, expectancy
 * (mean R multiple), verdict. The futures desk stays a PAPER TAPE until the
 * READY cohort proves edge on OUR data — not the Medium article's backtest:
 *   EDGE     — n ≥ 20 graded, hit rate ≥ 55%, expectancy ≥ +0.15R
 *   WEAK     — n ≥ 20, expectancy > 0 but below the bar
 *   NO_EDGE  — n ≥ 20, expectancy ≤ 0
 *   UNPROVEN — fewer than 20 graded READY names
 *
 * Run: npm run screener:grade  (also chained before each npm run screener)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchYahooChart } from './lib/yahooTechnicals.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HIST_PATH = path.join(ROOT, 'src/data/screener-history.json')
const OUT_PATH = path.join(ROOT, 'src/data/screener-validation.json')

const WINDOW_SESSIONS = 30
const MIN_GRADED = 20

function gradeRow(row, candlesAfter) {
  const upper = row.entry + row.r
  const lower = row.entry - row.r
  const window = candlesAfter.slice(0, WINDOW_SESSIONS)
  for (let i = 0; i < window.length; i++) {
    const c = window[i]
    const hitUp = c.high >= upper
    const hitDown = c.low <= lower
    if (hitUp && hitDown) {
      // Both bands in one session — can't sequence intraday; resolve by close
      return { status: c.close >= row.entry ? 'WIN' : 'LOSS', rMultiple: c.close >= row.entry ? 1 : -1, sessions: i + 1, ambiguous: true }
    }
    if (hitUp) return { status: 'WIN', rMultiple: 1, sessions: i + 1 }
    if (hitDown) return { status: 'LOSS', rMultiple: -1, sessions: i + 1 }
  }
  if (candlesAfter.length >= WINDOW_SESSIONS) {
    const final = window[window.length - 1].close
    return { status: 'TIMEOUT', rMultiple: Number(((final - row.entry) / row.r).toFixed(2)), sessions: WINDOW_SESSIONS }
  }
  return { status: 'OPEN' }
}

function cohortStats(rows) {
  const graded = rows.filter(r => r.status && r.status !== 'OPEN')
  const wins = graded.filter(r => r.status === 'WIN').length
  const losses = graded.filter(r => r.status === 'LOSS').length
  const timeouts = graded.filter(r => r.status === 'TIMEOUT').length
  const decided = wins + losses
  const expectancy = graded.length ? graded.reduce((s, r) => s + (r.rMultiple ?? 0), 0) / graded.length : null
  return {
    tracked: rows.length, graded: graded.length, open: rows.length - graded.length,
    wins, losses, timeouts,
    hitRate: decided ? Number((wins / decided).toFixed(3)) : null,
    expectancy: expectancy != null ? Number(expectancy.toFixed(3)) : null,
  }
}

async function main() {
  let hist
  try { hist = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8')) } catch {
    console.log('No screener-history.json yet — nothing to grade.')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  // Collect syms that still have OPEN rows in past snapshots
  const openSyms = new Set()
  for (const snap of hist.snapshots) {
    if (snap.date >= today) continue
    for (const row of snap.rows) if (row.status === 'OPEN') openSyms.add(row.sym)
  }

  if (openSyms.size === 0) {
    console.log('No open rows to grade.')
  } else {
    console.log(`Grading ${openSyms.size} names with open cohort rows…\n`)
    const candlesBySym = {}
    let i = 0
    for (const sym of openSyms) {
      process.stdout.write(`  [${String(++i).padStart(3)}/${openSyms.size}] ${sym.padEnd(14)} `)
      const data = await fetchYahooChart(sym)
      candlesBySym[sym] = data?.candles ?? null
      console.log(data ? 'OK' : 'FAILED')
      await new Promise(r => setTimeout(r, 80))
    }

    for (const snap of hist.snapshots) {
      if (snap.date >= today) continue
      for (const row of snap.rows) {
        if (row.status !== 'OPEN') continue
        const candles = candlesBySym[row.sym]
        if (!candles) continue
        const after = candles.filter(c => c.date > snap.date)
        if (!after.length) continue
        const g = gradeRow(row, after)
        if (g.status === 'OPEN') continue
        row.status = g.status
        row.rMultiple = g.rMultiple
        row.sessions = g.sessions
        if (g.ambiguous) row.ambiguous = true
        row.gradedOn = today
      }
    }
    fs.writeFileSync(HIST_PATH, JSON.stringify(hist, null, 2) + '\n')
  }

  // Scorecard — READY is the strategy, BASE is the control group
  const allRows = hist.snapshots.flatMap(s => s.rows.map(r => ({ ...r, snapDate: s.date })))
  const ready = cohortStats(allRows.filter(r => r.class === 'BREAKOUT_READY'))
  const base = cohortStats(allRows.filter(r => r.class === 'BASE_BUILDING'))

  let verdict = 'UNPROVEN'
  if (ready.graded >= MIN_GRADED) {
    if ((ready.hitRate ?? 0) >= 0.55 && (ready.expectancy ?? 0) >= 0.15) verdict = 'EDGE'
    else if ((ready.expectancy ?? 0) > 0) verdict = 'WEAK'
    else verdict = 'NO_EDGE'
  }

  const out = {
    asOf: today,
    verdict,
    bar: { minGraded: MIN_GRADED, minHitRate: 0.55, minExpectancy: 0.15, test: '+1R before −1R within 30 sessions, 1R = 2×ATR at snapshot' },
    snapshots: hist.snapshots.length,
    firstSnapshot: hist.snapshots[0]?.date ?? null,
    cohorts: { READY: ready, BASE: base },
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n')

  console.log(`\nScorecard — verdict: ${verdict}`)
  console.log(`  READY: ${ready.graded}/${ready.tracked} graded · hit ${ready.hitRate != null ? Math.round(ready.hitRate * 100) + '%' : '—'} · expectancy ${ready.expectancy ?? '—'}R`)
  console.log(`  BASE : ${base.graded}/${base.tracked} graded · hit ${base.hitRate != null ? Math.round(base.hitRate * 100) + '%' : '—'} · expectancy ${base.expectancy ?? '—'}R`)
  console.log(`\nWrote: src/data/screener-validation.json`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
