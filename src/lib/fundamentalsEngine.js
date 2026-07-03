/**
 * fundamentalsEngine.js — Phase 15.3: the objective grader.
 *
 * Turns one raw Screener record (fundamentals-raw.json shape) into a deterministic
 * fundamental scorecard: a 0–100 score, an A–F grade, hard red flags, and metric
 * chips. No judgement, no vibes — every output traces to a number on the page.
 *
 * This is the machine cross-check on the analyst's hand grade. Where the two
 * diverge, that's a prompt to re-examine the thesis (see reconcile-fundamentals.js).
 *
 * Banks & NBFCs are graded on a different rail: ROCE, debt trajectory and CFO are
 * meaningless for lenders (interest is operating, leverage is the business), so for
 * them we score ROE + growth + valuation + governance only.
 */

// Portfolio lenders — graded on the financials rail (no ROCE/debt/CFO checks).
const FINANCIALS = new Set(['ICICIBANK', 'IDFCFIRSTB', 'LTF', 'MANAPPURAM', 'M&MFIN'])

const isNum = v => typeof v === 'number' && Number.isFinite(v)
const lastN = (arr, n) => Array.isArray(arr) ? arr.slice(-n) : []
const sum = arr => arr.reduce((a, b) => a + b, 0)

// CFO/PAT conversion over the overlapping tail, plus count of negative-CFO years.
function cfoQuality(raw) {
  const cfo = raw.series?.cfo
  const pat = raw.series?.netProfit
  if (!Array.isArray(cfo) || !Array.isArray(pat) || !cfo.length || !pat.length) return null
  const n = Math.min(cfo.length, pat.length, 6)
  const c = lastN(cfo, n), p = lastN(pat, n)
  const sp = sum(p)
  const negYears = lastN(cfo, 6).filter(v => v < 0).length
  if (sp <= 0) return { ratio: null, negYears, years: n, structuralLoss: true }
  return { ratio: sum(c) / sp, negYears, years: n }
}

// Debt trajectory: latest borrowings vs ~4 years prior. >1 means rising leverage.
// Also detects a structural debt spiral: sustained growth off the series floor
// WITHOUT the earnings power to service it. Raw debt multiples false-positive on
// capex compounders (BEL/TRENT/DIXON scale borrowings with revenue), so the floor
// check only fires alongside weak profitability — that separates IDEA-class
// spirals from healthy scaling.
function debtTrend(raw) {
  const b = raw.series?.borrowings
  if (!Array.isArray(b) || b.length < 2) return null
  const latest = b[b.length - 1]
  const base = b[Math.max(0, b.length - 5)]
  if (!isNum(latest) || !isNum(base) || base <= 0) return null
  let spiral = false
  const positives = b.filter(v => isNum(v) && v > 0)
  if (positives.length >= 3) {
    const growth = latest > 2.5 * Math.min(...positives)
    let rises = 0
    for (let i = b.length - 3; i < b.length; i++) if (i > 0 && isNum(b[i]) && isNum(b[i - 1]) && b[i] > b[i - 1]) rises++
    const pat = Array.isArray(raw.series?.netProfit) ? raw.series.netProfit.filter(isNum) : []
    const cumPat = pat.slice(-5).reduce((a, v) => a + v, 0)
    const latestPat = pat[pat.length - 1]
    const roce = raw.snapshot?.roce
    // Weak earnings needs evidence, not absence — an empty PAT series proves nothing
    const weakEarnings = (pat.length > 0 && (latestPat <= 0 || cumPat <= 0)) || (isNum(roce) && roce < 10)
    spiral = growth && rises >= 2 && weakEarnings
  }
  return { mult: latest / base, latest, base, spiral }
}

// Profit CAGR consistency: prefer 5y, fall back to 3y.
function profitGrowth(raw) {
  const g = raw.growth?.profitCagr
  if (!g) return null
  return { five: g['5y'] ?? null, three: g['3y'] ?? null, ttm: g.ttm ?? null }
}

/**
 * gradeStock(raw) → objective scorecard.
 * Returns { grade, score, sector, pillars, redFlags[], metrics[], verdict }.
 */
export function gradeStock(raw) {
  if (!raw || !raw.snapshot) return null
  const fin = FINANCIALS.has(raw.sym)
  const { pe, roce, roe } = raw.snapshot
  const prom = raw.ownership?.promoterPct
  const pledge = raw.ownership?.pledgePct
  const cfoq = fin ? null : cfoQuality(raw)
  const debt = fin ? null : debtTrend(raw)
  const growth = profitGrowth(raw)
  const g5 = growth?.five, g3 = growth?.three

  const pillars = {}
  const redFlags = []
  const metrics = []

  // ── Profitability (0–25) ──
  // Financials: ROE only. Others: ROCE-led, ROE secondary.
  const profMetric = fin ? roe : roce
  let prof = 0
  if (isNum(profMetric)) {
    if (fin) prof = roe >= 18 ? 25 : roe >= 14 ? 19 : roe >= 11 ? 13 : roe >= 8 ? 7 : 2
    else prof = roce >= 25 ? 25 : roce >= 18 ? 20 : roce >= 14 ? 14 : roce >= 10 ? 8 : 3
  }
  pillars.profitability = prof
  if (!fin && isNum(roce) && roce < 10) redFlags.push(`Low ROCE ${roce}%`)
  if (fin && isNum(roe) && roe < 11) redFlags.push(`Low ROE ${roe}%`)
  metrics.push({ label: fin ? `ROE ${fmt(roe)}%` : `ROCE ${fmt(roce)}%`, tone: tone(prof, 14, 8) })

  // ── Growth (0–20) ──
  let grow = 0
  const gRef = isNum(g5) ? g5 : g3
  if (isNum(gRef)) grow = gRef >= 25 ? 20 : gRef >= 15 ? 15 : gRef >= 8 ? 10 : gRef >= 0 ? 5 : 0
  pillars.growth = grow
  if (isNum(gRef) && gRef < 0) redFlags.push(`Profit declining (${fmt(gRef)}% 5y)`)
  if (isNum(gRef)) metrics.push({ label: `Profit ${gRef >= 0 ? '+' : ''}${fmt(gRef)}%/yr`, tone: tone(grow, 12, 6) })

  // ── Cash quality (0–20, non-fin) ──
  if (!fin) {
    let cash = 10
    if (cfoq && cfoq.structuralLoss) {
      cash = 0
      redFlags.push('Cumulative losses — CFO/PAT unmeasurable')
    } else if (cfoq && isNum(cfoq.ratio)) {
      cash = cfoq.ratio >= 0.9 ? 20 : cfoq.ratio >= 0.6 ? 14 : cfoq.ratio >= 0.4 ? 7 : 2
      if (cfoq.ratio < 0.6) redFlags.push(`Weak cash conversion (CFO/PAT ${cfoq.ratio.toFixed(2)})`)
      if (cfoq.negYears >= 2) redFlags.push(`${cfoq.negYears} negative-CFO years`)
      metrics.push({ label: `CFO/PAT ${cfoq.ratio.toFixed(2)}`, tone: tone(cash, 14, 7) })
    }
    pillars.cashQuality = cash
  }

  // ── Leverage (0–15, non-fin) ──
  if (!fin) {
    let lev = 12
    if (debt && isNum(debt.mult)) {
      lev = debt.mult <= 1.2 ? 15 : debt.mult <= 2 ? 10 : debt.mult <= 4 ? 5 : 1
      if (debt.mult >= 3) redFlags.push(`Debt up ${debt.mult.toFixed(1)}x in ~4y`)
      if (debt.mult >= 2) metrics.push({ label: `Debt ${debt.mult.toFixed(1)}x/4y`, tone: tone(lev, 10, 5) })
    }
    if (debt?.spiral) {
      lev = Math.min(lev, 1)
      redFlags.push('Debt spiral — sustained borrowing growth with weak earnings power')
    }
    pillars.leverage = lev
  }

  // ── Valuation (0–10) ──
  let val = 5
  if (isNum(pe)) {
    // PEG-ish: cheap P/E or P/E justified by growth scores well; nosebleed P/E penalised.
    const peg = isNum(gRef) && gRef > 0 ? pe / gRef : null
    if (pe > 60) { val = 1; redFlags.push(`Rich valuation (P/E ${fmt(pe)})`) }
    else if (peg != null) val = peg <= 1 ? 10 : peg <= 1.8 ? 7 : peg <= 3 ? 4 : 2
    else val = pe <= 20 ? 9 : pe <= 35 ? 6 : pe <= 50 ? 3 : 1
  }
  pillars.valuation = val
  if (isNum(pe)) metrics.push({ label: `P/E ${fmt(pe)}`, tone: tone(val, 7, 3) })

  // ── Governance (0–10) ──
  // Pledge is the real landmine. Low promoter holding alone is NOT — plenty of
  // A-grade businesses are widely held & professionally run (INFY 14%, WABAG 19%).
  // Only a hollowed-out promoter block (<12%) or pledge-stacked stake is penalised hard.
  let gov = 10
  if (isNum(pledge) && pledge > 0) {
    gov = pledge >= 50 ? 0 : pledge >= 25 ? 3 : pledge >= 10 ? 6 : 8
    redFlags.push(`Promoter pledge ${fmt(pledge)}%`)
    metrics.push({ label: `Pledge ${fmt(pledge)}%`, tone: pledge >= 25 ? 'b' : 'n' })
  }
  if (isNum(prom) && prom < 12) {
    gov = Math.min(gov, 3)
    redFlags.push(`Hollow promoter stake ${fmt(prom)}%`)
    metrics.push({ label: `Promoter ${fmt(prom)}%`, tone: 'b' })
  } else if (isNum(prom) && prom < 26 && isNum(pledge) && pledge >= 10) {
    // low holding only matters when stacked on a pledge
    gov = Math.min(gov, 5)
  }
  pillars.governance = gov

  // ── Total → grade ──
  // Non-fin max = 25+20+20+15+10+10 = 100. Fin max = 25+20+10+10 = 65 → scale to 100.
  const raw100 = sum(Object.values(pillars))
  const score = fin ? Math.round((raw100 / 65) * 100) : Math.round(raw100)

  let grade = score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F'
  // Hard governance caps — a pledged or hollowed-out promoter block trumps the score.
  if (isNum(pledge) && pledge >= 50) grade = worse(grade, 'D')
  else if (isNum(pledge) && pledge >= 25) grade = worse(grade, 'C')
  if (isNum(prom) && prom < 12) grade = worse(grade, 'D')
  if (cfoq && isNum(cfoq.ratio) && cfoq.ratio < 0.4) grade = worse(grade, 'C')
  if (cfoq && cfoq.structuralLoss) grade = worse(grade, 'D')

  return {
    sym: raw.sym,
    sector: fin ? 'financial' : 'general',
    grade,
    score,
    pillars,
    redFlags,
    metrics: metrics.slice(0, 6),
    asOf: raw.asOf ?? null,
  }
}

// ── helpers ──
const ORDER = { A: 5, B: 4, C: 3, D: 2, F: 1 }
function worse(a, b) { return ORDER[a] <= ORDER[b] ? a : b }
function fmt(v) { return isNum(v) ? (Number.isInteger(v) ? v : +v.toFixed(1)) : '—' }
function tone(score, good, mid) { return score >= good ? 'g' : score >= mid ? 'n' : 'b' }

export { FINANCIALS, cfoQuality, debtTrend }
