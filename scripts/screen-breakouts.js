#!/usr/bin/env node
/**
 * screen-breakouts.js — THE SCREENER: pre-breakout radar over the full Nifty 200.
 *
 * Runs the 12-signal pre-breakout engine (scripts/lib/breakoutSignals.js) on
 * every Nifty 200 name — INCLUDING held names (a coiling setup in a stock you
 * own is an add/futures signal, not noise). Layers on top of the raw technical
 * screen, which is where this beats a naive Chartink scan:
 *
 *  1. Fundamentals fusion — AlphaModel grades/gates/red flags from
 *     opportunity-radar.json are joined by symbol where available, so a
 *     technically perfect landmine is flagged, not hidden.
 *  2. Sector clustering — ≥3 breakout-ready names in one industry = likely
 *     institutional rotation into that sector (computed, not eyeballed).
 *  3. Futures desk — F&O lot sizes from the public Kite instruments dump
 *     (contract metadata only — NOT portfolio/price data, doctrine intact),
 *     gated by the tradebook laws: default answer is NO, at most ONE
 *     candidate. Gates (all machine-checked, fail-closed):
 *       regime    — Nifty must be above its 50dma or the desk STANDS DOWN
 *       setup     — score ≥80, leading sector, ATR ≤2.5%/day (survivable)
 *       quality   — radar grade A/B or held with conv ≥8, never distressed
 *       catalyst  — a dated results board-meeting INSIDE the contract window
 *                   (NSE event-calendar); no catalyst, no trade
 *       sizing    — risk-to-stop for one lot must fit 0.75% of book
 *     Exit plan is fully systematized: 2×ATR/support stop, measured-move
 *     target, 15-session time stop (pre-breakout thesis expires if the coil
 *     doesn't resolve). Futures live in the exact 1–12mo window the tradebook
 *     bleeds in — the desk exists to say no with evidence.
 *  4. Prove-it snapshots — every run appends the READY/BASE cohorts to
 *     screener-history.json; scripts/grade-screener.js grades them forward
 *     (+1R before −1R within 30 sessions) → screener-validation.json. The
 *     desk stays a paper tape until that scorecard shows real edge.
 *
 * Output: src/data/screener.json (UI reads only this file) + history append.
 * Run: npm run screener
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchYahooChart } from './lib/yahooTechnicals.js'
import { phaseScoreFor } from './lib/industryPhase.js'
import { computeBreakoutSignals } from './lib/breakoutSignals.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

// Nifty 200 held names — industry per NSE classification (universe.json only
// carries industries for the 188 non-held constituents).
const HELD_INDUSTRY = {
  ASIANPAINT: 'Consumer Durables', BEL: 'Capital Goods', DABUR: 'Fast Moving Consumer Goods',
  HAL: 'Capital Goods', ICICIBANK: 'Financial Services', INDHOTEL: 'Consumer Services',
  INFY: 'Information Technology', LTF: 'Financial Services', LT: 'Construction',
  MARUTI: 'Automobile and Auto Components', PERSISTENT: 'Information Technology',
  POLYCAB: 'Consumer Durables',
}

// Futures desk gates (the doctrine, encoded)
const FUT_MIN_SCORE = 80        // setup must be top-shelf, not merely good
const FUT_MAX_ATR_PCT = 2.5     // daily ATR% — leverage must be survivable
const FUT_OK_PHASES = ['markup', 'accumulation']  // leading sectors only
const FUT_CATALYST_WINDOW_DAYS = 30  // dated catalyst must sit inside the contract month
const FUT_RISK_BUDGET_PCT = 0.0075   // max risk-to-stop per trade: 0.75% of book
const FUT_TIME_STOP_SESSIONS = 15    // coil that hasn't resolved in 15 sessions has failed

async function fetchFnoLots(attempt = 1) {
  // Public Kite instruments dump — static contract metadata (lot sizes), no auth.
  try {
    const res = await fetch('https://api.kite.trade/instruments/NFO', { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const csv = await res.text()
    const lots = {}
    for (const line of csv.split('\n').slice(1)) {
      const cols = line.split(',')
      if (cols.length < 12 || cols[9] !== 'FUT') continue
      const underlying = cols[2].replace(/\d{2}[A-Z]{3}FUT\s*$/, '')
      const lot = parseInt(cols[8], 10)
      if (underlying && lot > 0 && !lots[underlying]) lots[underlying] = lot
    }
    console.log(`F&O lots: ${Object.keys(lots).length} underlyings from Kite instruments dump`)
    return lots
  } catch (e) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * attempt))
      return fetchFnoLots(attempt + 1)
    }
    console.warn(`F&O lots fetch failed after ${attempt} attempts (${e.message}) — futures desk will run without lot math`)
    return null
  }
}

// Regime filter — Nifty vs its 50dma. Breakout base rates collapse in a
// corrective tape; the desk stands down entirely rather than fight it.
async function fetchNiftyRegime() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=6mo&interval=1d'
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const closes = (json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(c => c != null)
    if (closes.length < 50) throw new Error('insufficient index history')
    const last = closes[closes.length - 1]
    const sma50 = closes.slice(-50).reduce((s, v) => s + v, 0) / 50
    return { regime: last >= sma50 ? 'RISK_ON' : 'RISK_OFF', nifty: Number(last.toFixed(1)), sma50: Number(sma50.toFixed(1)) }
  } catch (e) {
    console.warn(`Nifty regime fetch failed (${e.message}) — treating as UNKNOWN (desk fails closed)`)
    return { regime: 'UNKNOWN', nifty: null, sma50: null }
  }
}

// Catalyst gate — NSE event-calendar (~600 upcoming board meetings, one call).
// Returns sym → next financial-results date. Fail-closed: null map = every
// candidate fails the catalyst gate with an explicit reason.
const MONTH_MAP = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
async function fetchResultsCalendar() {
  try {
    const res = await fetch('https://www.nseindia.com/api/event-calendar', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const events = await res.json()
    const map = {}
    for (const e of events) {
      if (!/financial\s*result/i.test(e.purpose ?? '')) continue
      const [dd, mon, yyyy] = (e.date ?? '').split('-')
      const mm = MONTH_MAP[mon]
      if (!mm) continue
      const iso = `${yyyy}-${mm}-${dd.padStart(2, '0')}`
      if (!map[e.symbol] || iso < map[e.symbol]) map[e.symbol] = iso
    }
    console.log(`Results calendar: ${Object.keys(map).length} names with dated results meetings`)
    return map
  } catch (e) {
    console.warn(`NSE calendar fetch failed (${e.message}) — catalyst gate fails closed`)
    return null
  }
}

function daysFromToday(iso) {
  return Math.round((new Date(iso) - new Date(new Date().toISOString().split('T')[0])) / 86400000)
}

function pickFuturesCandidate(rows, holdingsBySym, { regimeInfo, calendar, bookValue, lotsLoaded }) {
  if (regimeInfo.regime !== 'RISK_ON') {
    return {
      call: 'STAND_DOWN',
      reason: regimeInfo.regime === 'RISK_OFF'
        ? `Nifty ${regimeInfo.nifty} below its 50dma (${regimeInfo.sma50}) — breakout base rates collapse in a corrective tape. No longs on leverage until the index reclaims the 50dma.`
        : 'Index regime unverifiable this run — the desk fails closed.',
      candidate: null, bench: [],
    }
  }

  const riskBudget = Math.round(bookValue * FUT_RISK_BUDGET_PCT)
  const failures = []
  const candidates = []
  for (const r of rows) {
    if (r.class !== 'BREAKOUT_READY') continue
    const fails = []
    if (r.score < FUT_MIN_SCORE) fails.push(`setup ${r.score} < ${FUT_MIN_SCORE}`)
    if (r.metrics.atrPct == null || r.metrics.atrPct > FUT_MAX_ATR_PCT) fails.push(`ATR ${r.metrics.atrPct ?? '—'}% too hot for leverage`)
    if (!FUT_OK_PHASES.includes(r.sectorPhase)) fails.push(`sector ${r.sectorPhase}, not leading`)
    if (!r.fnoLot) fails.push(lotsLoaded ? 'not in F&O segment' : 'F&O lot data unavailable this scan')
    if (r.fundamentals?.distressed) fails.push('structural distress')
    const held = holdingsBySym[r.sym]
    const fundOk = r.fundamentals?.grade === 'A' || r.fundamentals?.grade === 'B' || (held && held.conv >= 8)
    if (!fundOk) fails.push(held ? `held but conv ${held.conv} < 8` : 'fundamentals unverified (not radar-graded)')

    // Catalyst gate — machine-checked, fail-closed
    const catalystDate = calendar ? calendar[r.sym] ?? null : null
    const daysToCat = catalystDate ? daysFromToday(catalystDate) : null
    if (!calendar) fails.push('catalyst unverifiable (NSE calendar down) — no catalyst, no trade')
    else if (!catalystDate || daysToCat < 1 || daysToCat > FUT_CATALYST_WINDOW_DAYS) {
      fails.push(catalystDate
        ? `results ${catalystDate} outside the ${FUT_CATALYST_WINDOW_DAYS}d contract window`
        : 'no dated results catalyst in the contract window')
    }

    // Sizing gate — one lot's risk-to-stop must fit the budget
    const m = r.metrics
    const stop = Math.max(m.support20 ?? 0, m.ltp - 2 * (m.atrPct / 100) * m.ltp)
    const riskPerLot = r.fnoLot ? Math.round((m.ltp - stop) * r.fnoLot) : null
    if (riskPerLot != null && riskPerLot > riskBudget) fails.push(`risk/lot ${riskPerLot} exceeds 0.75% book budget (${riskBudget})`)

    if (fails.length === 0) candidates.push({ r, stop, riskPerLot, catalystDate, daysToCat })
    else if (r.score >= FUT_MIN_SCORE - 10) failures.push({ sym: r.sym, score: r.score, failedGates: fails })
  }
  candidates.sort((a, b) => b.r.score - a.r.score)
  const top = candidates[0] ?? null
  // Runners-up that fully cleared go to the bench too — ONE bullet, never a basket
  for (const c of candidates.slice(1)) failures.unshift({ sym: c.r.sym, score: c.r.score, failedGates: ['cleared all gates — but the desk signals ONE name, never a basket'] })

  if (!top) return { call: 'NO_TRADE', candidate: null, bench: failures.slice(0, 5), riskBudget }

  const { r, stop, riskPerLot, catalystDate, daysToCat } = top
  const m = r.metrics
  const risk = m.ltp - stop
  // Measured-move target: coil depth projected from entry, floor 2R
  const coilDepth = (m.band20Pct / 100) * m.ltp
  const target = Number((m.ltp + Math.max(2 * risk, coilDepth)).toFixed(2))
  const contractValue = Math.round(r.fnoLot * m.ltp)
  return {
    call: 'CANDIDATE',
    riskBudget,
    candidate: {
      sym: r.sym, name: r.name, industry: r.industry, score: r.score,
      ltp: m.ltp, atrPct: m.atrPct, lot: r.fnoLot,
      contractValue, marginEst: Math.round(contractValue * 0.22),
      stop: Number(stop.toFixed(2)), target,
      rr: Number(((target - m.ltp) / risk).toFixed(2)),
      riskPerLot, lots: Math.max(1, Math.floor(riskBudget / riskPerLot)),
      timeStopSessions: FUT_TIME_STOP_SESSIONS,
      catalystDate, daysToCatalyst: daysToCat,
      grade: r.fundamentals?.grade ?? null,
      held: Boolean(holdingsBySym[r.sym]),
    },
    bench: failures.slice(0, 5),
  }
}

// Prove-it snapshot — slim READY/BASE cohorts appended to screener-history.json
// for forward grading by grade-screener.js. Same-day rerun replaces the snapshot.
function appendSnapshot(rows, regimeInfo, asOf) {
  const histPath = path.join(ROOT, 'src/data/screener-history.json')
  let hist = { snapshots: [] }
  try { hist = JSON.parse(fs.readFileSync(histPath, 'utf8')) } catch { /* first run */ }
  const cohort = rows
    .filter(r => r.class === 'BREAKOUT_READY' || r.class === 'BASE_BUILDING')
    .map(r => ({
      sym: r.sym, class: r.class, score: r.score,
      entry: r.metrics.ltp,
      r: Number((2 * (r.metrics.atrPct / 100) * r.metrics.ltp).toFixed(2)), // 1R = 2×ATR
      status: 'OPEN',
    }))
  hist.snapshots = hist.snapshots.filter(s => s.date !== asOf)
  hist.snapshots.push({ date: asOf, regime: regimeInfo.regime, nifty: regimeInfo.nifty, rows: cohort })
  hist.snapshots.sort((a, b) => a.date.localeCompare(b.date))
  fs.writeFileSync(histPath, JSON.stringify(hist, null, 2) + '\n')
  console.log(`Snapshot appended: ${cohort.length} READY/BASE names → screener-history.json (${hist.snapshots.length} snapshots)`)
}

async function main() {
  const universe = read('src/data/universe.json')
  const portfolio = read('src/data/portfolio.json')
  const radar = read('src/data/opportunity-radar.json')

  const holdingsBySym = Object.fromEntries(portfolio.holdings.filter(h => h.qty > 0).map(h => [h.sym.replace(/-PA$/, ''), h]))
  const radarBySym = Object.fromEntries((radar.rows ?? []).map(r => [r.sym, r]))
  const bookValue = portfolio.holdings.reduce((s, h) => s + h.qty * h.ltp, 0)

  const scanList = [
    ...universe.stocks.map(s => ({ sym: s.sym, name: s.name, industry: s.industry })),
    ...universe.held.map(sym => ({ sym, name: sym, industry: HELD_INDUSTRY[sym] ?? 'Services' })),
  ]

  const [fnoLots, regimeInfo, calendar] = await Promise.all([fetchFnoLots(), fetchNiftyRegime(), fetchResultsCalendar()])
  console.log(`Regime: ${regimeInfo.regime} (Nifty ${regimeInfo.nifty ?? '—'} vs 50dma ${regimeInfo.sma50 ?? '—'})`)

  const rows = []
  const stats = { ok: 0, failed: 0 }

  console.log(`\nBreakout scan: ${scanList.length} Nifty 200 names (held included)\n`)
  for (let i = 0; i < scanList.length; i++) {
    const s = scanList[i]
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${scanList.length}] ${s.sym.padEnd(14)} `)
    const data = await fetchYahooChart(s.sym)
    if (!data) { console.log('FAILED'); stats.failed++; continue }
    const b = computeBreakoutSignals(data.candles)
    const { phase } = phaseScoreFor(s.industry)
    const rad = radarBySym[s.sym]
    rows.push({
      sym: s.sym, name: s.name, industry: s.industry, sectorPhase: phase,
      held: Boolean(holdingsBySym[s.sym]),
      fnoLot: fnoLots?.[s.sym] ?? null,
      catalystDate: calendar?.[s.sym] ?? null,
      score: b.score, class: b.class, signals: b.signals, metrics: b.metrics,
      fundamentals: rad ? {
        grade: rad.grade ?? null, modelScore: rad.model?.score ?? null, modelTier: rad.model?.tier ?? null,
        redFlags: rad.redFlags ?? [], distressed: Boolean(rad.distressed), pledge: rad.pledge ?? null,
      } : null,
    })
    console.log(`${b.class.padEnd(15)} score=${String(b.score).padStart(3)}`)
    stats.ok++
    await new Promise(r => setTimeout(r, 80))
  }

  rows.sort((a, b) => b.score - a.score)

  // Sector clusters — ≥3 breakout-ready names in one industry = rotation signal
  const ready = rows.filter(r => r.class === 'BREAKOUT_READY')
  const byInd = {}
  for (const r of ready) (byInd[r.industry] ??= []).push(r.sym)
  const clusters = Object.entries(byInd).filter(([, syms]) => syms.length >= 3)
    .map(([industry, syms]) => ({ industry, syms, count: syms.length }))
    .sort((a, b) => b.count - a.count)

  const futuresDesk = pickFuturesCandidate(rows, holdingsBySym, { regimeInfo, calendar, bookValue, lotsLoaded: Boolean(fnoLots) })

  const asOf = new Date().toISOString().split('T')[0]
  const out = {
    asOf,
    scanned: stats.ok, failed: stats.failed,
    counts: {
      ready: ready.length,
      base: rows.filter(r => r.class === 'BASE_BUILDING').length,
      neutral: rows.filter(r => r.class === 'NEUTRAL').length,
      distressed: rows.filter(r => r.class === 'DISTRESSED').length,
    },
    fnoLotsLoaded: Boolean(fnoLots),
    calendarLoaded: Boolean(calendar),
    regime: regimeInfo,
    clusters,
    futuresDesk,
    rows,
  }
  fs.writeFileSync(path.join(ROOT, 'src/data/screener.json'), JSON.stringify(out, null, 2) + '\n')
  appendSnapshot(rows, regimeInfo, asOf)

  console.log(`\n${'='.repeat(70)}`)
  console.log(`Scanned ${stats.ok}/${scanList.length} · READY ${out.counts.ready} · BASE ${out.counts.base} · DISTRESSED ${out.counts.distressed}`)
  if (clusters.length) console.log(`Sector clusters: ${clusters.map(c => `${c.industry} (${c.count})`).join(' · ')}`)
  console.log(`Futures desk: ${futuresDesk.call}${futuresDesk.candidate ? ` — ${futuresDesk.candidate.sym} (results ${futuresDesk.candidate.catalystDate})` : ''}`)
  console.log(`\nWrote: src/data/screener.json`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
