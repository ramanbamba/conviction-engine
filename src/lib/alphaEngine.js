// Computes portfolio alpha vs Nifty50 benchmark from backtest series.
// All functions are pure — no React, no side effects.

const WINDOWS = ['1M', '3M', 'YTD', '1Y', '3Y', 'Inception']

function findStartIdx(series, windowKey) {
  const n = series.length
  if (windowKey === '1M') return n - 2
  if (windowKey === '3M') return n - 4
  if (windowKey === '1Y') return n - 13
  if (windowKey === '3Y') return n - 37
  if (windowKey === 'Inception') return 0
  if (windowKey === 'YTD') {
    const currentYear = series[n - 1].date.slice(0, 4)
    // walk backwards to find Jan of current year
    for (let i = n - 1; i >= 0; i--) {
      if (series[i].date === `${currentYear}-01`) return i
    }
    // fallback: use 12 months
    return n - 13
  }
  return 0
}

export function computeAlpha(series) {
  if (!series?.length) return {}
  const latest = series[series.length - 1]
  const result = {}

  for (const w of WINDOWS) {
    const startIdx = findStartIdx(series, w)
    if (startIdx < 0 || startIdx >= series.length - 1) { result[w] = null; continue }
    const start = series[startIdx]
    const portReturn = (latest.portfolioValue - start.portfolioValue) / start.portfolioValue
    const niftyReturn = (latest.niftyClose - start.niftyClose) / start.niftyClose
    result[w] = { portReturn, niftyReturn, alpha: portReturn - niftyReturn }
  }

  return result
}

export function sparklinePoints(series, windowKey) {
  if (!series?.length) return []
  const startIdx = Math.max(0, findStartIdx(series, windowKey))
  const slice = series.slice(startIdx)
  if (slice.length < 2) return []

  const startPort  = slice[0].portfolioValue
  const startNifty = slice[0].niftyClose

  return slice.map((s, i) => ({
    i,
    port:  (s.portfolioValue / startPort  - 1) * 100,
    nifty: (s.niftyClose     / startNifty - 1) * 100,
  }))
}

export { WINDOWS }
