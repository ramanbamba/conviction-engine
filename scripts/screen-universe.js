#!/usr/bin/env node
/**
 * screen-universe.js — PHASE 19 Sprint D, Stage 1: the cheap wide net.
 *
 * Pulls 1y technicals (Yahoo, free, no auth) for every name in the opportunity
 * universe (src/data/universe.json — Nifty 200 minus held), scores momentum +
 * sector phase, and writes a ranked shortlist to src/data/universe-technicals.json.
 * NO fundamentals, NO scraping of Screener — this stage is safe to run often.
 *
 * The shortlist (default top 25) is what Stage 2 (fetch-universe-fundamentals.js)
 * will spend the expensive Screener-scrape budget on. Nothing here is investable
 * advice yet — it's triage, the same way an analyst screens before deep-diving.
 *
 * Run: npm run universe:screen [-- --top 30]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchYahooChart, computeTechnicals } from './lib/yahooTechnicals.js'
import { phaseScoreFor } from './lib/industryPhase.js'
import { technicalScore } from '../src/lib/alphaModel.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const UNIVERSE_PATH = path.join(ROOT, 'src/data/universe.json')
const OUT = path.join(ROOT, 'src/data/universe-technicals.json')

const ARGV = process.argv.slice(2)
const topIdx = ARGV.indexOf('--top')
const SHORTLIST_SIZE = topIdx >= 0 ? parseInt(ARGV[topIdx + 1], 10) : 25

// Stage-1 score: momentum (technicalScore, 0-100) blended with sector phase,
// same 70/30 lean as the alpha model's M+S weighting ratio (.30/.10 -> 3:1).
function stage1Score(momentum, sectorScore) {
  if (momentum == null) return null
  return Math.round(momentum * 0.75 + sectorScore * 0.25)
}

async function main() {
  const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, 'utf8'))
  const rows = []
  const stats = { ok: 0, failed: 0 }

  console.log(`Stage 1 scan: ${universe.stocks.length} names, technicals-only (Yahoo, no auth)\n`)

  for (let i = 0; i < universe.stocks.length; i++) {
    const s = universe.stocks[i]
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${universe.stocks.length}] ${s.sym.padEnd(14)} `)
    const data = await fetchYahooChart(s.sym)
    if (!data) {
      console.log('FAILED (no data)')
      stats.failed++
      continue
    }
    const tech = computeTechnicals(data.candles)
    const mom = technicalScore(tech, tech.last)
    const { phase, score: secScore } = phaseScoreFor(s.industry)
    const score = stage1Score(mom?.score, secScore)

    rows.push({
      sym: s.sym, name: s.name, industry: s.industry,
      ltp: tech.last, rsi14: tech.rsi14, vsSma50Pct: tech.vsSma50Pct, vsSma200Pct: tech.vsSma200Pct,
      fromHighPct: tech.fromHighPct, momentumScore: mom?.score ?? null, momentumNotes: mom?.notes ?? [],
      sectorPhase: phase, sectorScore: secScore, stage1Score: score,
      // Persisted so Stage 2 can re-run technicalScore() on exact levels instead
      // of back-deriving approximations from the percentages above.
      sma50: tech.sma50, sma200: tech.sma200,
      fiftyTwoWeekHigh: tech.fiftyTwoWeekHigh, fiftyTwoWeekLow: tech.fiftyTwoWeekLow,
      support: tech.support, resistance: tech.resistance,
    })
    console.log(`OK  mom=${mom?.score ?? '—'} sector=${phase}(${secScore}) stage1=${score}`)
    stats.ok++
    await new Promise(r => setTimeout(r, 80))
  }

  rows.sort((a, b) => (b.stage1Score ?? -1) - (a.stage1Score ?? -1))
  const shortlist = rows.slice(0, SHORTLIST_SIZE)

  const out = {
    asOf: new Date().toISOString().split('T')[0],
    universeSize: universe.stocks.length,
    scanned: stats.ok, failed: stats.failed,
    shortlistSize: shortlist.length,
    shortlist: shortlist.map(r => r.sym),
    rows,
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')

  console.log(`\n${'='.repeat(70)}`)
  console.log(`Scanned ${stats.ok}/${universe.stocks.length} (${stats.failed} failed)`)
  console.log(`\nTop ${shortlist.length} shortlist for Stage 2 (fundamentals deep-dive):\n`)
  shortlist.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.sym.padEnd(14)} ${r.industry.padEnd(28)} stage1=${r.stage1Score}  mom=${r.momentumScore ?? '—'}  ${r.sectorPhase}  RSI=${r.rsi14 ?? '—'}  ${r.fromHighPct >= -10 ? 'near 52w high' : ''}`))
  console.log(`\nWrote: ${OUT}`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
