/**
 * attribution.js
 * Per-stock alpha contribution to total portfolio alpha.
 *
 * Approximation: uses each holding's pnlPct (return since avg cost) vs
 * benchmark return for the same window. Weighted by portfolio value share.
 * Sum of contributions ≈ total portfolio alpha.
 */

/**
 * @param {Array}  holdings  - enriched holdings from usePortfolio (must have .value, .pnlPct, .sym)
 * @param {Object} benchmark - benchmark.json content
 * @param {string} window    - 'ytd' | '1y' | '3y' | 'inception'
 * @returns {Array} sorted by |contribution| desc
 */
export function stockAlphaAttribution(holdings, benchmark, window = 'ytd') {
  if (!holdings?.length || !benchmark?.windows) return []

  const w = benchmark.windows[window]
  if (!w) return []

  const benchReturn = w.benchReturn  // decimal
  const totalValue  = holdings.reduce((s, h) => s + (h.value || 0), 0)
  if (totalValue === 0) return []

  return holdings
    .map(h => {
      const weight         = h.value / totalValue
      const holdingReturn  = h.pnlPct ?? 0           // decimal (usePortfolio computes this)
      const contribution   = (holdingReturn - benchReturn) * weight
      return { sym: h.sym, contribution, holdingReturn, benchReturn, weight }
    })
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
}
