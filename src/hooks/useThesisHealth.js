import { useMemo } from 'react'
import { computePendingReflections } from '../lib/memoryEngine'

// B5: detects hope positions (holding down >10% with no logged thesis)
// and surfaces pending T+30/T+90 reflection prompts
export function useThesisHealth(thesisLedger = [], holdings = []) {
  return useMemo(() => {
    const pendingReflections = computePendingReflections(thesisLedger, holdings)

    const hopePositions = holdings.filter(h => {
      const hasThesis = thesisLedger.some(t => t.sym === h.sym)
      return !hasThesis && h.pnlPct != null && h.pnlPct < -0.10
    })

    return { pendingReflections, hopePositions }
  }, [thesisLedger, holdings])
}
