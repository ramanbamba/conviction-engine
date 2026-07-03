/**
 * themeExposure.js
 * Aggregate portfolio holdings by their `theme` field.
 *
 * Holdings with no theme field are grouped as 'Unclassified'.
 */

/**
 * @param {Array} holdings - enriched holdings from usePortfolio
 * @returns {Array} sorted by value desc: [{ theme, value, pct, stocks[] }]
 */
export function themeExposure(holdings = []) {
  const totalValue = holdings.reduce((s, h) => s + (h.value || 0), 0)
  if (totalValue === 0) return []

  const byTheme = {}

  holdings.forEach(h => {
    const theme = h.theme || 'Unclassified'
    if (!byTheme[theme]) byTheme[theme] = { theme, value: 0, stocks: [] }
    byTheme[theme].value += h.value || 0
    byTheme[theme].stocks.push(h.sym)
  })

  return Object.values(byTheme)
    .map(t => ({ ...t, pct: t.value / totalValue }))
    .sort((a, b) => b.value - a.value)
}
