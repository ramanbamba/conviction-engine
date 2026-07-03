import { useMemo } from 'react'

export function useRiskMonitor(holdings, memoryData) {
  const breaches = useMemo(() => {
    if (!holdings) return []

    return holdings.filter(h => {
      const pnlPct = h.pnlPct // This is (value - invested) / invested
      
      // Stop loss thresholds
      let threshold = null
      if (h.bucket === 'Power Alpha') {
        threshold = -0.08
      } else if (h.bucket === 'Platinum') {
        threshold = -0.20
      } else if (h.bucket === 'Stars') {
        threshold = -0.25
      }

      if (threshold !== null && pnlPct <= threshold) {
        return true
      }
      return false
    }).map(h => {
      // Find matching thesis in memory data
      const thesisItem = memoryData?.thesisLedger?.find(t => t.sym === h.sym)
      return {
        ...h,
        threshold: h.bucket === 'Power Alpha' ? -0.08 : h.bucket === 'Platinum' ? -0.20 : -0.25,
        thesis: thesisItem?.thesis || h.note || "No logged thesis found. Action needed."
      }
    })
  }, [holdings, memoryData])

  return breaches
}
