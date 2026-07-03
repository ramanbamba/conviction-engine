/**
 * concentrationEngine.js — the target book.
 *
 * FocusCard nudges qualitatively ("cull the tail, feed the winners").
 * This builds the *quantitative* answer: the model-ideal concentrated book — a
 * target weight per name (conviction × AlphaScore, gated, convex, capped) — and
 * the exact reallocation to get there. The thesis (PHASE_19): beat the index by
 * concentrating into the highest-edge core; starve landmines and the weak tail.
 *
 * The CORE earns capital only where conviction AND the machine agree on quality
 * (not gated, conv ≥ 6, alpha ≥ 50). Everything else is classified honestly:
 *   CUT      — genuine weak/exit-grade tail → target 0, redeploy
 *   OVERRIDE — model gates it but you hold conv ≥ 6 for a catalyst (KAYNES,
 *              KPIGREEN…) → the machine-vs-you decision, surfaced not screamed
 *   BUILD    — active, intentionally small build → left at current weight
 *   REVIEW   — conviction-held but the model is lukewarm (mid alpha, not gated)
 *              → left at current weight; your deepen-here-if-you-want pool
 *
 * Winners within the cap are never trimmed (the tradebook is emphatic: early
 * trimming of >1yr winners cost ₹4.18L). Only over-cap names get trimmed.
 *
 * computeTargetBook(holdings, alphaMap, opts) → {
 *   rows, effectiveNow, effectiveTarget, cut[], override[], build[], review[],
 *   feed[], trim[], redeployValue, fundNeeded, coreCount
 * }
 */

const STRATEGIC = new Set(['Hedge', 'Cash', 'Satellites'])
const HARD_CAP = 0.12
const SOFT_CAP = 0.08
const CONVEXITY = 2          // edge^2 — separates winners without going winner-take-all
const CORE_CONV = 6         // conviction floor for the core
const CORE_ALPHA = 50       // model-score floor for the core

const isBuild = h => !!h.isNew || /build|scale to|tranche/i.test(h.note || '')

function edgeOf({ conv, alpha, gated }) {
  const convN = conv != null ? Math.max(0, Math.min(1, conv / 10)) : 0.5
  const alphaN = alpha != null ? Math.max(0, Math.min(1, alpha / 100)) : 0.5
  let e = Math.sqrt(convN * alphaN)
  if (gated) e *= 0.4
  if (conv != null && conv < 5) e *= 0.3
  return e
}

export function computeTargetBook(holdings = [], alphaMap = {}, opts = {}) {
  const hardCap = opts.hardCap ?? HARD_CAP
  const val = h => (h.qty || 0) * (h.ltp || 0)
  const total = holdings.reduce((a, h) => a + val(h), 0) || 1

  const strategic = holdings.filter(h => STRATEGIC.has(h.bucket))
  const equities = holdings.filter(h => !STRATEGIC.has(h.bucket))
  const strategicShare = strategic.reduce((a, h) => a + val(h), 0) / total
  const stratW = strategic.map(h => val(h) / total)

  // Classify every equity
  const items = equities.map(h => {
    const m = alphaMap[h.sym]
    const gated = m ? (m.gates.gov * m.gates.eq) < 0.85 : false
    const alpha = m?.score ?? null
    const build = isBuild(h)
    const conv = h.conv ?? null
    let klass
    if (build) klass = 'BUILD'
    else if (gated && (conv ?? 0) >= 6) klass = 'OVERRIDE'                       // conscious catalyst hold (even if alpha very low)
    else if ((conv != null && conv < 5) || (alpha != null && alpha < 35) || gated) klass = 'CUT'
    else if (!gated && (conv ?? 0) >= CORE_CONV && (alpha ?? 0) >= CORE_ALPHA) klass = 'CORE'
    else klass = 'REVIEW'                                                        // model lukewarm, conviction-held
    return {
      sym: h.sym, bucket: h.bucket, conv, alpha, gated, build, klass,
      edge: edgeOf({ conv, alpha, gated }), curVal: val(h), curPct: val(h) / total,
    }
  })

  // Builds, reviews, and overrides keep their current weight (held positions);
  // only CUT → 0. The freed cut capital concentrates into the core.
  const heldShare = items.filter(r => r.klass === 'BUILD' || r.klass === 'REVIEW' || r.klass === 'OVERRIDE').reduce((a, r) => a + r.curPct, 0)
  const coreShare = (1 - strategicShare) - heldShare
  const core = items.filter(r => r.klass === 'CORE')
  const sumPow = core.reduce((a, r) => a + Math.pow(r.edge, CONVEXITY), 0) || 1
  core.forEach(r => { r.tgt = (Math.pow(r.edge, CONVEXITY) / sumPow) * coreShare })

  // Cap pass — clamp over-cap, redistribute excess across uncapped by edge^k
  let excess = 0
  core.forEach(r => { if (r.tgt > hardCap) { excess += r.tgt - hardCap; r.tgt = hardCap; r.cappedFlag = true } })
  if (excess > 0) {
    const open = core.filter(r => !r.cappedFlag)
    const openPow = open.reduce((a, r) => a + Math.pow(r.edge, CONVEXITY), 0) || 1
    open.forEach(r => { r.tgt += excess * (Math.pow(r.edge, CONVEXITY) / openPow) })
  }

  // Targets: core = computed (but never below current unless over cap — let winners run);
  // build/review/override = current (held); cut = 0
  items.forEach(r => {
    if (r.klass === 'CORE') { if (r.curPct <= hardCap) r.tgt = Math.max(r.tgt, r.curPct); return }
    r.tgt = r.klass === 'CUT' ? 0 : r.curPct
  })

  const rows = items.map(r => {
    const deltaPct = r.tgt - r.curPct
    const deltaVal = deltaPct * total
    let action = 'HOLD'
    if (r.klass === 'CUT') action = 'CUT'
    else if (r.klass === 'OVERRIDE') action = 'OVERRIDE'
    else if (r.klass === 'BUILD') action = 'BUILD'
    else if (r.klass === 'REVIEW') action = 'REVIEW'
    else if (deltaVal > 25000) action = 'ADD'
    else if (deltaVal < -25000) action = 'TRIM'
    return {
      sym: r.sym, bucket: r.bucket, conv: r.conv, alpha: r.alpha, gated: r.gated, klass: r.klass,
      edge: r.edge, curPct: r.curPct * 100, tgtPct: r.tgt * 100, deltaPct: deltaPct * 100, deltaVal,
      curVal: r.curVal, action, softCapped: r.tgt > SOFT_CAP, cappedFlag: !!r.cappedFlag,
    }
  }).sort((a, b) => b.tgtPct - a.tgtPct || b.curPct - a.curPct)

  const sq = arr => arr.reduce((a, w) => a + w * w, 0)
  const effectiveNow = 1 / (sq(items.map(r => r.curPct)) + sq(stratW))
  const effectiveTarget = 1 / (sq(items.map(r => r.tgt)) + sq(stratW))

  const cut = rows.filter(r => r.action === 'CUT').sort((a, b) => a.edge - b.edge)
  const override = rows.filter(r => r.action === 'OVERRIDE').sort((a, b) => b.curVal - a.curVal)
  const build = rows.filter(r => r.action === 'BUILD')
  const review = rows.filter(r => r.action === 'REVIEW').sort((a, b) => (a.alpha ?? 50) - (b.alpha ?? 50))
  const trim = rows.filter(r => r.action === 'TRIM').sort((a, b) => a.deltaVal - b.deltaVal)
  const feed = rows.filter(r => r.action === 'ADD').sort((a, b) => b.deltaVal - a.deltaVal)

  const redeployValue = cut.reduce((a, r) => a + r.curVal, 0) + trim.reduce((a, r) => a + Math.abs(r.deltaVal), 0)

  return {
    rows, effectiveNow, effectiveTarget, coreCount: core.length,
    cut, override, build, review, trim, feed,
    redeployValue, fundNeeded: feed.reduce((a, r) => a + r.deltaVal, 0),
  }
}
