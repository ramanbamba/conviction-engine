#!/usr/bin/env node
/**
 * backtest-screener.js — point-in-time backtest of the 12-signal engine.
 *
 * The forward prove-it loop (grade-screener.js) is the gold standard but needs
 * weeks of tape. This gets graded outcomes TODAY, honestly: for each Nifty 200
 * name, walk 2 years of daily candles and at every 15th session compute the
 * breakout signals using ONLY candles up to that date (no lookahead — the
 * classifier is pure price/volume, so historical replay is clean), then grade
 * the next 30 sessions we already know: +1R before −1R (1R = 2×ATR at signal).
 *
 * What it can and cannot validate:
 *   CAN    — the READY vs BASE cohort edge, the desk's technical subset
 *            (score ≥80, ATR ≤2.5), and the regime filter (outcomes split by
 *            Nifty above/below its 50dma at signal date).
 *   CANNOT — the fundamentals and catalyst gates (radar grades and the NSE
 *            calendar only exist for today). Live results should therefore be
 *            slightly BETTER than this backtest if those gates add anything.
 *   BIAS   — samples are stride-15 with 30-session forward windows (~50%
 *            overlap → correlated, effective n is lower than raw n), and the
 *            window is one specific 2y Indian tape. Treat EDGE here as license
 *            for ONE lot, not the full budget — forward tape unlocks the rest.
 *
 * Output: src/data/screener-backtest.json (full samples, audit trail)
 *         + `backtest` summary block merged into screener-validation.json.
 * Run: npm run screener:backtest
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchYahooChart } from './lib/yahooTechnicals.js'
import { computeBreakoutSignals } from './lib/breakoutSignals.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

const STRIDE = 15            // sessions between samples (~3 weeks)
const MIN_HISTORY = 210      // sessions needed before a signal (SMA200 + buffer)
const FWD_WINDOW = 30        // grading window
const DESK_MIN_SCORE = 80    // the desk's technical subset
const DESK_MAX_ATR = 2.5

async function fetchNiftyRegimeSeries() {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=2y&interval=1d'
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' } })
  if (!res.ok) throw new Error(`Nifty fetch HTTP ${res.status}`)
  const json = await res.json()
  const r = json.chart?.result?.[0]
  const ts = r?.timestamp ?? []
  const closes = r?.indicators?.quote?.[0]?.close ?? []
  const regimeByDate = {}
  const series = []
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue
    series.push(closes[i])
    if (series.length < 50) continue
    const sma50 = series.slice(-50).reduce((s, v) => s + v, 0) / 50
    const date = new Date(ts[i] * 1000).toISOString().split('T')[0]
    regimeByDate[date] = closes[i] >= sma50 ? 'RISK_ON' : 'RISK_OFF'
  }
  return regimeByDate
}

function gradeForward(entry, r, fwd) {
  const upper = entry + r, lower = entry - r
  for (let i = 0; i < Math.min(FWD_WINDOW, fwd.length); i++) {
    const c = fwd[i]
    const up = c.high >= upper, down = c.low <= lower
    if (up && down) return { status: c.close >= entry ? 'WIN' : 'LOSS', rMultiple: c.close >= entry ? 1 : -1, sessions: i + 1 }
    if (up) return { status: 'WIN', rMultiple: 1, sessions: i + 1 }
    if (down) return { status: 'LOSS', rMultiple: -1, sessions: i + 1 }
  }
  if (fwd.length >= FWD_WINDOW) {
    const final = fwd[FWD_WINDOW - 1].close
    return { status: 'TIMEOUT', rMultiple: Number(((final - entry) / r).toFixed(2)), sessions: FWD_WINDOW }
  }
  return null // not enough forward tape
}

// The desk's ACTUAL trade plan: +2R target, −1R stop, 15-session time stop.
// Asymmetric — breakeven at a 33% hit rate. Ambiguous both-bands session
// resolves as LOSS (conservative: assume the stop traded first).
const PLAN_TIME_STOP = 15
function gradePlan(entry, r, fwd) {
  const target = entry + 2 * r, stop = entry - r
  for (let i = 0; i < Math.min(PLAN_TIME_STOP, fwd.length); i++) {
    const c = fwd[i]
    const up = c.high >= target, down = c.low <= stop
    if (up && down) return { status: 'LOSS', rMultiple: -1, sessions: i + 1 }
    if (up) return { status: 'WIN', rMultiple: 2, sessions: i + 1 }
    if (down) return { status: 'LOSS', rMultiple: -1, sessions: i + 1 }
  }
  if (fwd.length >= PLAN_TIME_STOP) {
    const final = fwd[PLAN_TIME_STOP - 1].close
    return { status: 'TIMEOUT', rMultiple: Number(((final - entry) / r).toFixed(2)), sessions: PLAN_TIME_STOP }
  }
  return null
}

function subStats(samples, statusKey, rKey) {
  const wins = samples.filter(s => s[statusKey] === 'WIN').length
  const losses = samples.filter(s => s[statusKey] === 'LOSS').length
  const timeouts = samples.filter(s => s[statusKey] === 'TIMEOUT').length
  const decided = wins + losses
  const expectancy = samples.length ? samples.reduce((s, x) => s + x[rKey], 0) / samples.length : null
  return {
    wins, losses, timeouts,
    hitRate: decided ? Number((wins / decided).toFixed(3)) : null,
    expectancy: expectancy != null ? Number(expectancy.toFixed(3)) : null,
  }
}

function stats(samples) {
  return {
    n: samples.length,
    race: subStats(samples, 'status', 'rMultiple'),          // symmetric ±1R / 30 sessions
    plan: subStats(samples, 'planStatus', 'planR'),          // the desk plan: +2R / −1R / 15 sessions
  }
}

async function main() {
  const universe = read('src/data/universe.json')
  const scanList = [...universe.stocks.map(s => s.sym), ...universe.held]

  console.log('Fetching Nifty regime series (2y)…')
  const regimeByDate = await fetchNiftyRegimeSeries()

  const samples = []
  let ok = 0, failed = 0
  console.log(`Backtest: ${scanList.length} names × 2y, stride ${STRIDE}, +1R/−1R within ${FWD_WINDOW} sessions\n`)

  for (let i = 0; i < scanList.length; i++) {
    const sym = scanList[i]
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${scanList.length}] ${sym.padEnd(14)} `)
    const data = await fetchYahooChart(sym, null, '2y')
    if (!data || data.candles.length < MIN_HISTORY + FWD_WINDOW) {
      console.log('SKIP (insufficient history)')
      failed++
      await new Promise(r => setTimeout(r, 60))
      continue
    }
    const candles = data.candles
    let added = 0
    for (let j = MIN_HISTORY; j <= candles.length - 2; j += STRIDE) {
      const asOf = candles.slice(0, j + 1)
      const b = computeBreakoutSignals(asOf)
      if (b.class !== 'BREAKOUT_READY' && b.class !== 'BASE_BUILDING') continue
      const entry = b.metrics.ltp
      const r = 2 * (b.metrics.atrPct / 100) * entry
      const fwd = candles.slice(j + 1)
      const g = gradeForward(entry, r, fwd)
      const p = gradePlan(entry, r, fwd)
      if (!g || !p) continue
      const date = candles[j].date
      samples.push({
        sym, date, class: b.class, score: b.score,
        regime: regimeByDate[date] ?? 'UNKNOWN',
        desk: b.class === 'BREAKOUT_READY' && b.score >= DESK_MIN_SCORE && b.metrics.atrPct <= DESK_MAX_ATR,
        status: g.status, rMultiple: g.rMultiple, sessions: g.sessions,
        planStatus: p.status, planR: p.rMultiple, planSessions: p.sessions,
      })
      added++
    }
    console.log(`OK  ${added} samples`)
    ok++
    await new Promise(r => setTimeout(r, 60))
  }

  const ready = samples.filter(s => s.class === 'BREAKOUT_READY')
  const base = samples.filter(s => s.class === 'BASE_BUILDING')
  const desk = samples.filter(s => s.desk)
  const readyOn = ready.filter(s => s.regime === 'RISK_ON')
  const readyOff = ready.filter(s => s.regime === 'RISK_OFF')
  const deskOn = desk.filter(s => s.regime === 'RISK_ON')

  const summary = {
    asOf: new Date().toISOString().split('T')[0],
    window: '2y', stride: STRIDE, fwdSessions: FWD_WINDOW,
    names: ok, samples: samples.length,
    caveats: 'Overlapping forward windows (effective n < raw n); single 2y tape; fundamentals/catalyst gates not replayable — live desk is stricter than this subset.',
    cohorts: {
      READY: stats(ready),
      BASE: stats(base),
      DESK: stats(desk),
      READY_RISK_ON: stats(readyOn),
      READY_RISK_OFF: stats(readyOff),
      DESK_RISK_ON: stats(deskOn),
    },
  }
  // Verdict on the PLAN test (what the money actually does) for the desk
  // subset in risk-on — the closest replayable proxy for a live desk trade.
  const deskS = summary.cohorts.DESK_RISK_ON
  summary.verdict =
    deskS.n >= 100 && (deskS.plan.expectancy ?? 0) >= 0.25 ? 'EDGE'
    : deskS.n >= 100 && (deskS.plan.expectancy ?? 0) > 0 ? 'WEAK'
    : deskS.n >= 100 ? 'NO_EDGE' : 'INSUFFICIENT'

  fs.writeFileSync(path.join(ROOT, 'src/data/screener-backtest.json'), JSON.stringify({ ...summary, rows: samples }, null, 2) + '\n')

  // Merge summary into screener-validation.json so the UI has one import
  const valPath = path.join(ROOT, 'src/data/screener-validation.json')
  const val = JSON.parse(fs.readFileSync(valPath, 'utf8'))
  val.backtest = summary
  fs.writeFileSync(valPath, JSON.stringify(val, null, 2) + '\n')

  console.log(`\n${'='.repeat(70)}`)
  console.log(`Backtest verdict (DESK_RISK_ON, plan test): ${summary.verdict}`)
  const f = (x, pct = false) => x == null ? '—' : pct ? Math.round(x * 100) + '%' : (x > 0 ? '+' : '') + x + 'R'
  for (const [k, s] of Object.entries(summary.cohorts)) {
    console.log(`  ${k.padEnd(15)} n=${String(s.n).padStart(4)}  race: hit=${f(s.race.hitRate, true)} exp=${f(s.race.expectancy)}  |  plan(2R/1R/15s): hit=${f(s.plan.hitRate, true)} exp=${f(s.plan.expectancy)} (W${s.plan.wins}/L${s.plan.losses}/T${s.plan.timeouts})`)
  }
  console.log(`\nWrote: src/data/screener-backtest.json + validation merge`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
