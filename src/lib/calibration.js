/**
 * calibration.js — Phase 16.4: the mirror.
 *
 * Two questions, answered from the user's own data:
 *   1. Is my conviction calibrated? — live tier returns from the current book.
 *      (Proven 2026-06-10: tier 8–10 avg +6.2% vs negative for everything below.)
 *   2. Is the PM right? Am I right when I override it? — hit rates from the
 *      graded pmLedger (grades accrue at T+30/T+90 via pmLoop).
 */

const EXCLUDED_BUCKETS = new Set(['Hedge', 'Cash', 'Satellites'])

/** Live conviction-tier calibration from the current holdings. */
export function convictionCalibration(holdings = []) {
  const eq = holdings.filter(h => h.conv && h.avg && !EXCLUDED_BUCKETS.has(h.bucket))
  const tiers = [
    { key: 'high', label: '8–10', test: c => c >= 8 },
    { key: 'mid', label: '6–7.9', test: c => c >= 6 && c < 8 },
    { key: 'low', label: '<6', test: c => c < 6 },
  ].map(t => {
    const rows = eq.filter(h => t.test(h.conv))
    const rets = rows.map(h => (h.ltp - h.avg) / h.avg)
    return {
      ...t,
      n: rows.length,
      avgRet: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
      winRate: rets.length ? rets.filter(r => r > 0).length / rets.length : null,
    }
  })

  // Mismatches: where stated conviction and actual outcome disagree hardest
  const mismatches = eq
    .map(h => ({ sym: h.sym, conv: h.conv, ret: (h.ltp - h.avg) / h.avg }))
    .filter(x => (x.conv >= 7 && x.ret < -0.10) || (x.conv < 5 && x.ret > 0.10))
    .sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret))
    .slice(0, 4)

  return { tiers, mismatches }
}

/** PM vs user hit rates from graded ledger entries (t90 preferred, t30 fallback). */
export function pmRecord(pmLedger = []) {
  const graded = g => g?.t90 || g?.t30 || null
  const responded = pmLedger.filter(e => ['RATIFY', 'VETO'].includes(e.response))
  const score = entries => {
    const g = entries.map(e => graded(e.grade)).filter(x => x && x !== 'NEUTRAL')
    return { graded: g.length, right: g.filter(x => x === 'RIGHT').length }
  }
  return {
    ratified: responded.filter(e => e.response === 'RATIFY').length,
    vetoed: responded.filter(e => e.response === 'VETO').length,
    pending: pmLedger.filter(e => e.response === 'PENDING').length,
    pm: score(responded.filter(e => e.response === 'RATIFY')),     // ratified = PM's calls
    you: score(responded.filter(e => e.response === 'VETO')),      // vetoes = your overrides
  }
}
