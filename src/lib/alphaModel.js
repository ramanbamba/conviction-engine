/**
 * alphaModel.js — THE CORE IP. The proprietary alpha engine for Indian equities.
 *
 * One model, rarely touched. Everything else (briefs, screens, ranks, loops) is a
 * consumer. Change policy, validation protocol and full rationale: ALPHA_MODEL.md.
 *
 * Design (India-specific, evidence-weighted):
 *
 *   AlphaScore = GATE_gov × GATE_eq × ( .30·Q + .30·M + .20·G + .10·V + .10·S )
 *
 *   Q  Quality   — the strongest documented premium in India (ROCE persistence,
 *                  cash conversion, balance-sheet discipline)
 *   M  Momentum  — 12-1 style trend premium, robust in India, survives costs
 *   G  Growth    — earnings growth drives midcap re-rating in a flows-led market
 *   V  Valuation — deliberately LOW weight: plain value is weak in India (traps);
 *                  used as a guardrail, not a driver (GARP, not deep value)
 *   S  Sector    — rotation-phase tilt (markup > accumulation > distribution)
 *
 *   Gates (multiplicative, because Indian landmines don't average out):
 *   GATE_gov — promoter pledge / hollow promoter stake. A pledge unwind destroys
 *              50–90% regardless of momentum. Floor 0.30.
 *   GATE_eq  — earnings-quality audit severity (accruals, CFO gaps, capitalized
 *              interest). RED earnings are fiction; fiction gets discounted.
 *
 * Human conviction is intentionally EXCLUDED — the model is the machine view;
 * calibration.js referees machine vs human over realized outcomes.
 */

// ── M sleeve: technical score 0–100 (trend 40 · RSI 25 · 52w 20 · support 15) ──
export function technicalScore(t, ltp) {
  if (!t || !ltp) return null
  let s = 0
  const notes = []

  const above50 = t.sma50 != null && ltp > t.sma50
  const above200 = t.sma200 != null && ltp > t.sma200
  const golden = above50 && above200 && t.sma50 > t.sma200
  if (golden) { s += 40; notes.push('uptrend (P>50>200)') }
  else if (above50 && above200) { s += 30; notes.push('above both SMAs') }
  else if (above200) { s += 20; notes.push('above 200d') }
  else if (above50) { s += 12; notes.push('above 50d only') }
  else { notes.push('below both SMAs') }

  if (t.rsi14 != null) {
    if (t.rsi14 >= 45 && t.rsi14 <= 65) { s += 25; notes.push(`RSI ${t.rsi14} healthy`) }
    else if (t.rsi14 > 65 && t.rsi14 <= 75) { s += 15; notes.push(`RSI ${t.rsi14} hot`) }
    else if (t.rsi14 >= 30 && t.rsi14 < 45) { s += 12; notes.push(`RSI ${t.rsi14} soft`) }
    else if (t.rsi14 < 30) { s += 8; notes.push(`RSI ${t.rsi14} oversold`) }
    else { s += 5; notes.push(`RSI ${t.rsi14} overbought`) }
  }

  const hi = t.high52w ?? t.fiftyTwoWeekHigh
  if (hi) {
    const lo = t.low52w ?? t.fiftyTwoWeekLow ?? hi * 0.6
    const pos = (ltp - lo) / Math.max(hi - lo, 1e-9)
    if (pos >= 0.8) { s += 20; notes.push('near 52w high') }
    else if (pos >= 0.55) s += 14
    else if (pos >= 0.3) s += 8
    else { s += 3; notes.push('near 52w low') }
  }

  if (t.support != null && t.support > 0) {
    const cushion = (ltp - t.support) / t.support
    if (cushion >= 0.08) s += 15
    else if (cushion >= 0.03) s += 10
    else { s += 4; notes.push('sitting on support') }
  }

  return { score: Math.min(100, Math.round(s)), notes }
}

// ── Sector phase tilt (S sleeve): theme keyword → rotation sector phase ──
const THEME_TO_SECTOR = [
  [/defence/i, 'Defence'],
  [/bank|nbfc/i, 'Banks / gold NBFCs'],
  [/infra|t&d|epc|water|energy/i, 'Infra / T&D EPC'],
  [/auto/i, 'Auto + ancillaries'],
  [/\bit\b|software/i, 'IT services'],
  [/renew|ems|solar/i, 'Renewables / EMS'],
]
const PHASE_SCORE = { markup: 80, 'markup (early)': 75, accumulation: 65, 'distribution / contra-accumulation': 35, distribution: 25 }

function sectorScore(theme, sectorRotation) {
  if (!theme || !sectorRotation?.sectors) return 50
  const hit = THEME_TO_SECTOR.find(([re]) => re.test(theme))
  if (!hit) return 50
  const sec = sectorRotation.sectors.find(s => s.name === hit[1])
  return sec ? (PHASE_SCORE[sec.phase] ?? 50) : 50
}

// ── Gates ──
function govGate(snapshot, pillars) {
  let g = 1
  const pledge = snapshot?.pledge ?? 0
  const promoter = snapshot?.promoter
  if (pledge >= 50) g *= 0.5
  else if (pledge >= 25) g *= 0.75
  else if (pledge >= 10) g *= 0.9
  if (promoter != null && promoter < 12) g *= 0.85
  if ((pillars?.governance ?? 10) <= 3) g *= 0.9
  return Math.max(0.3, g)
}

function eqGate(auditSeverity, pillars) {
  let g = 1
  if (auditSeverity === 'RED') g *= 0.6
  else if (auditSeverity === 'WATCH') g *= 0.9
  // extreme cash-conversion failure compounds even without an audit
  if ((pillars?.cashQuality ?? 10) <= 2) g *= 0.85
  return Math.max(0.4, g)
}

const WEIGHTS = { Q: 0.30, M: 0.30, G: 0.20, V: 0.10, S: 0.10 }
const TIERS = [[70, 'STRONG'], [55, 'POSITIVE'], [40, 'NEUTRAL'], [-1, 'NEGATIVE']]
const VERDICT = { STRONG: 'BUY', POSITIVE: 'WATCH', NEUTRAL: 'WATCH', NEGATIVE: 'AVOID' }

/**
 * alphaModel(inputs) → the machine's expected-alpha view of one stock.
 * @param {Object} i  { fundamentals (fundamentals.json stocks[sym]), technicals
 *                      (computedTechnicals), ltp, theme, auditSeverity, sectorRotation }
 */
export function alphaModel({ fundamentals, technicals, ltp, theme, auditSeverity, sectorRotation } = {}) {
  const cp = fundamentals?.computed
  const t = technicalScore(technicals, ltp)
  if (!cp && !t) return null

  // Sleeves 0–100, derived from the two hard-data engines
  const p = cp?.pillars || {}
  const sleeves = {
    Q: cp ? Math.round(((p.profitability ?? 0) / 25 * 50 + (p.cashQuality ?? 10) / 20 * 30 + (p.leverage ?? 12) / 15 * 20)) : null,
    M: t?.score ?? null,
    G: cp ? Math.round((p.growth ?? 0) / 20 * 100) : null,
    V: cp ? Math.round((p.valuation ?? 5) / 10 * 100) : null,
    S: sectorScore(theme, sectorRotation),
  }

  // Weighted blend over available sleeves (re-normalize if one is missing)
  let num = 0, den = 0
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (sleeves[k] != null) { num += sleeves[k] * w; den += w }
  }
  if (den === 0) return null
  const raw = num / den

  const gates = { gov: govGate(cp?.snapshot, p), eq: eqGate(auditSeverity, p) }
  const score = Math.round(raw * gates.gov * gates.eq)
  const tier = TIERS.find(([min]) => score >= min)[1]

  // Narrative: dominant driver, dominant risk
  const named = { Q: 'quality', M: 'momentum', G: 'growth', V: 'valuation', S: 'sector phase' }
  const avail = Object.entries(sleeves).filter(([, v]) => v != null)
  const driver = named[avail.reduce((a, b) => (b[1] > a[1] ? b : a))[0]]
  let risk = named[avail.reduce((a, b) => (b[1] < a[1] ? b : a))[0]]
  if (gates.gov < 0.8) risk = 'governance gate'
  else if (gates.eq < 0.8) risk = 'earnings quality gate'

  const conf = (cp ? 0.5 : 0) + (t ? 0.35 : 0) + (auditSeverity ? 0.15 : 0)
  return {
    score, tier, verdict: VERDICT[tier], sleeves, gates,
    driver, risk,
    confidence: conf >= 0.85 ? 'high' : conf >= 0.5 ? 'medium' : 'low',
    reason: `${named[avail.reduce((a, b) => (b[1] > a[1] ? b : a))[0]]} leads at ${Math.round(raw)} pre-gate${(gates.gov * gates.eq) < 0.95 ? `; gated ×${(gates.gov * gates.eq).toFixed(2)} (${risk})` : ''}.`,
  }
}

/** Rank the whole book — consumed by briefs, CLI, deploy ranking. */
export function rankBook(holdings = [], fundamentalsData = {}, insightsData = {}, aiInsights = {}) {
  return holdings
    .filter(h => !['Hedge', 'Cash', 'Satellites'].includes(h.bucket))
    .map(h => ({
      sym: h.sym, bucket: h.bucket, conv: h.conv ?? null,
      model: alphaModel({
        fundamentals: fundamentalsData?.stocks?.[h.sym],
        technicals: insightsData?.positions?.[h.sym]?.computedTechnicals,
        ltp: h.ltp,
        theme: h.theme,
        auditSeverity: aiInsights?.earningsAudit?.stocks?.[h.sym]?.severity,
        sectorRotation: aiInsights?.sectorRotation,
      }),
    }))
    .filter(r => r.model)
    .sort((a, b) => b.model.score - a.model.score)
}
