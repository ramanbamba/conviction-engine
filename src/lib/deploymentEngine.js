/**
 * deploymentEngine.js — "I have ₹X. Buy what, exactly?"
 *
 * Synthesises the Ideal compass + advisor model gaps + Keeper Test + conviction
 * into a ranked, rupee-specific allocation. Two modes:
 *   - 'new'      : deploy a fresh amount, biased to underweight buckets
 *   - 'rotation' : source the amount from CHURN holdings (cut → fund)
 *
 * computeDeployment(holdings, { amount, mode, rearview }) → {
 *   mode, amount, allocations: [{ sym, bucket, amount, score, gapPp, rationale }],
 *   sources: [{ sym, amount }]   // rotation mode only
 *   eligibleCount, note
 * }
 */
import { IDEAL_PORTFOLIO } from '../config/idealPortfolio.js'
import { keeperVerdict } from './keeperTest.js'

const PER_NAME_CAP = 0.40        // no single name gets >40% of a deployment
const MIN_TICKET = 5000          // ignore sub-₹5k crumbs
const MODEL_BUCKETS = new Set(['Platinum', 'Power Alpha'])

export function computeDeployment(holdings = [], { amount = 0, mode = 'new', rearview = {}, alphaMap = {} } = {}) {
  const total = holdings.reduce((a, h) => a + (h.qty || 0) * (h.ltp || 0), 0) || 1

  // Current bucket value
  const bucketVal = {}
  for (const h of holdings) bucketVal[h.bucket] = (bucketVal[h.bucket] || 0) + (h.qty || 0) * (h.ltp || 0)

  // Platinum model totals (for advisorWt gap)
  const platTotal = bucketVal['Platinum'] || 1

  // ── Rotation: source amount from CHURN names ──
  let sources = []
  if (mode === 'rotation') {
    sources = holdings
      .map(h => ({ h, k: keeperVerdict(h, rearview) }))
      .filter(x => x.k?.verdict === 'CHURN')
      .map(x => ({ sym: x.h.sym, amount: Math.round((x.h.qty || 0) * (x.h.ltp || 0)) }))
      .sort((a, b) => b.amount - a.amount)
    amount = sources.reduce((a, s) => a + s.amount, 0)
  }

  if (amount < MIN_TICKET) {
    return { mode, amount, allocations: [], sources, eligibleCount: 0, note: mode === 'rotation' ? 'No churn proceeds to rotate.' : 'Amount too small to deploy.' }
  }

  // ── Score eligible targets ──
  const scored = []
  for (const h of holdings) {
    const k = keeperVerdict(h, rearview)
    const v = h.verdict = k?.verdict
    // Exclude: churn/watch targets, strategic sleeves we don't actively add to here
    if (['CHURN', 'WATCH'].includes(v)) continue
    if (['Cash', 'Satellites'].includes(h.bucket)) continue

    const conv = Number(h.conv ?? 0)
    if (conv < 6) continue // don't deploy into low conviction

    // Alpha-model gate: fresh money NEVER goes into landmine-gated names
    // (governance/earnings-quality multipliers — e.g. KPIGREEN's pledge+debt),
    // regardless of conviction. The model's gates exist precisely for this.
    const am = alphaMap[h.sym]
    if (am && (am.gates.gov * am.gates.eq) < 0.85) continue

    const val = (h.qty || 0) * (h.ltp || 0)

    // Bucket-need gap (pp under ideal)
    const idealPct = (IDEAL_PORTFOLIO.buckets[h.bucket]?.pct || 0) * 100
    const curPct = val / total * 100 // proxy at holding level via its bucket share below
    const bucketCurPct = (bucketVal[h.bucket] || 0) / total * 100
    const bucketGapPp = idealPct - bucketCurPct // +ve = underweight

    // Model gap (Platinum only): underweight vs advisorWt
    let modelGapPp = 0
    if (h.bucket === 'Platinum' && h.advisorWt) {
      const actualW = val / platTotal * 100
      modelGapPp = (h.advisorWt * 100) - actualW
    }

    // Distance to TP — valuation headroom (0..1, capped)
    let headroom = 0.5
    if (h.tp && h.ltp) headroom = Math.max(0, Math.min(1, (h.tp - h.ltp) / h.ltp))

    // Score: human conviction and machine alpha get equal votes; gaps and
    // headroom decide between equally-good names. (No model data → neutral 50.)
    const alphaScore = am?.score ?? 50
    const score =
      conv * 1.0 +
      alphaScore / 10 +
      Math.max(0, bucketGapPp) * 0.6 +
      Math.max(0, modelGapPp) * 0.8 +
      headroom * 4 +
      (v === 'KEEP' ? 2 : 0)

    scored.push({ sym: h.sym, bucket: h.bucket, conv, alphaScore: am?.score ?? null, score, bucketGapPp, modelGapPp, headroom, val })
  }

  if (!scored.length) return { mode, amount, allocations: [], sources, eligibleCount: 0, note: 'No eligible deploy targets (all churn/watch/low-conviction).' }

  scored.sort((a, b) => b.score - a.score)

  // ── Greedy allocation across top names, capped per-name ──
  const cap = Math.round(amount * PER_NAME_CAP)
  const totalScore = scored.reduce((a, s) => a + s.score, 0)
  let remaining = amount
  const allocations = []
  for (const s of scored) {
    if (remaining < MIN_TICKET) break
    const want = Math.min(cap, Math.round(amount * (s.score / totalScore)))
    const alloc = Math.min(want, remaining)
    if (alloc < MIN_TICKET) continue
    allocations.push({
      sym: s.sym, bucket: s.bucket, amount: alloc,
      score: Number(s.score.toFixed(1)),
      gapPp: Number((s.modelGapPp || s.bucketGapPp).toFixed(1)),
      rationale: buildRationale(s),
    })
    remaining -= alloc
  }

  // Distribute any rounding remainder into the top allocation
  if (remaining >= MIN_TICKET && allocations.length) allocations[0].amount += remaining

  return { mode, amount, allocations, sources, eligibleCount: scored.length, note: null }
}

function buildRationale(s) {
  const bits = [`Conv ${s.conv}`]
  if (s.alphaScore != null) bits.push(`α${s.alphaScore}`)
  if (s.bucket === 'Platinum' && s.modelGapPp > 0.3) bits.push(`${s.modelGapPp.toFixed(1)}pp under model`)
  else if (s.bucketGapPp > 1) bits.push(`${s.bucket} ${s.bucketGapPp.toFixed(0)}pp underweight`)
  if (s.headroom > 0.2) bits.push(`${(s.headroom * 100).toFixed(0)}% to TP`)
  return bits.join(' · ')
}
