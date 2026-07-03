/**
 * focusEngine.js — the concentration nudge.
 *
 * At ₹88L, a 35-name book is an index in disguise (effective N ~23). The alpha
 * is in the proven 8s; the sub-scale tail dilutes it. But the fix is NOT just
 * "fewer names" — it's making capital follow conviction × alpha:
 *   CULL — sub-scale names with weak conviction or a gated/low model score
 *   FEED — high-conviction, high-alpha names running under-sized
 * Active builds (by design small) are exempt from culling.
 *
 * computeFocus(holdings, alphaMap) → {
 *   count, equityCount, effectiveN, targetBand, alignment,
 *   cull: [{sym,pct,conv,alpha,ret,value}], feed: [...], cullValue
 * }
 */

const STRATEGIC = new Set(['Hedge', 'Cash', 'Satellites'])

function corr(xs, ys) {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}

export function computeFocus(holdings = [], alphaMap = {}) {
  const val = h => (h.qty || 0) * (h.ltp || 0)
  const total = holdings.reduce((a, h) => a + val(h), 0) || 1
  const weights = holdings.map(h => val(h) / total)
  const effectiveN = 1 / weights.reduce((a, w) => a + w * w, 0)

  const eq = holdings.filter(h => !STRATEGIC.has(h.bucket))
  const rows = eq.map(h => ({
    sym: h.sym,
    bucket: h.bucket,
    conv: h.conv ?? null,
    alpha: alphaMap[h.sym]?.score ?? null,
    gated: alphaMap[h.sym] ? (alphaMap[h.sym].gates.gov * alphaMap[h.sym].gates.eq) < 0.85 : false,
    pct: val(h) / total * 100,
    ret: h.avg ? (h.ltp - h.avg) / h.avg : null,
    value: val(h),
    isBuild: !!h.isNew || /build/i.test(h.note || ''),
  }))

  // Does capital follow the machine? (weight vs alpha correlation, equities w/ scores)
  const scored = rows.filter(r => r.alpha != null)
  const alignment = corr(scored.map(r => r.pct), scored.map(r => r.alpha))

  // CULL: sub-scale AND (weak conviction OR weak/gated model) AND not an active build
  const cull = rows
    .filter(r => r.pct < 2.2 && !r.isBuild && ((r.conv != null && r.conv < 6) || (r.alpha != null && r.alpha < 40) || r.gated))
    .sort((a, b) => (a.alpha ?? 50) - (b.alpha ?? 50))

  // FEED: proven winners running under-sized (conviction ≥8, model agrees, <3.5% weight)
  const feed = rows
    .filter(r => r.conv >= 8 && (r.alpha ?? 0) >= 65 && r.pct < 3.5 && !r.gated)
    .sort((a, b) => (b.alpha ?? 0) - (a.alpha ?? 0))

  return {
    count: holdings.length,
    equityCount: eq.length,
    effectiveN,
    targetBand: [18, 20],
    alignment,
    cull,
    feed,
    cullValue: cull.reduce((a, r) => a + r.value, 0),
  }
}
