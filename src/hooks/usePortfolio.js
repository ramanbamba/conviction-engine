import { useMemo } from 'react'
import { BUCKET_ORDER } from '../lib/format'

export function enrichHoldings(raw) {
  return raw.map(h => {
    const invested = h.qty * h.avg
    const value    = h.qty * h.ltp
    const pnl      = value - invested
    const pnlPct   = invested > 0 ? pnl / invested : 0
    const upside   = h.tp && h.ltp ? (h.tp - h.ltp) / h.ltp : 0
    const gap      = h.tgtVal != null ? h.tgtVal - value : null
    const addQty   = (gap != null && gap > 0 && h.ltp > 0) ? Math.max(0, Math.round(gap / h.ltp)) : 0
    return { ...h, invested, value, pnl, pnlPct, upside, gap, addQty }
  })
}

export function usePortfolio(data, targetsData) {
  const holdings = useMemo(() => enrichHoldings(data.holdings), [data.holdings])

  const totals = useMemo(() => {
    const totalVal = holdings.reduce((s, h) => s + h.value, 0)
    const totalInv = holdings.reduce((s, h) => s + h.invested, 0)
    const totalPnL = totalVal - totalInv
    const totalROI = totalInv > 0 ? totalPnL / totalInv : 0
    const totalTarget = Object.values(data.bucketTargets).reduce((s, b) => s + b.target, 0)
    const totalGap = totalTarget - totalVal
    return { totalVal, totalInv, totalPnL, totalROI, totalTarget, totalGap }
  }, [holdings, data.bucketTargets])

  const buckets = useMemo(() =>
    BUCKET_ORDER.map(name => {
      const hh  = holdings.filter(h => h.bucket === name)
      const val = hh.reduce((s, h) => s + h.value, 0)
      const inv = hh.reduce((s, h) => s + h.invested, 0)
      return { name, val, inv }
    }), [holdings])

  const concentrationAlerts = useMemo(() => {
    if (!targetsData?.sectorLimits) return []
    const limits = targetsData.sectorLimits
    const defaultMax = limits.defaultMax || 0.25
    
    // Group by theme
    const themeVals = {}
    holdings.forEach(h => {
      const t = h.theme || 'Other'
      themeVals[t] = (themeVals[t] || 0) + h.value
    })

    const alerts = []
    for (const [theme, val] of Object.entries(themeVals)) {
      if (totals.totalVal === 0) break
      const pct = val / totals.totalVal
      const limit = limits.overrides?.[theme] ?? defaultMax
      if (pct > limit) {
        // Find candidates (sort by conviction asc)
        const candidates = holdings
          .filter(h => h.theme === theme)
          .sort((a, b) => a.conv - b.conv)
          .map(h => h.sym)

        alerts.push({
          theme,
          pct,
          limit,
          candidates
        })
      }
    }
    return alerts.sort((a, b) => (b.pct - b.limit) - (a.pct - a.limit))
  }, [holdings, totals.totalVal, targetsData?.sectorLimits])

  return { holdings, totals, buckets, concentrationAlerts }
}
