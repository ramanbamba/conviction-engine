/**
 * useRebalance — memoized rebalance ladder.
 *
 * Static — recomputes only when holdings / aiInsights / insightsData change.
 * brainIndex is imported directly (same pattern as useStockDossier).
 */
import { useMemo } from 'react'
import { computeRebalance } from '../lib/rebalanceEngine'
import brainIndex from '../data/brain-index.json'

export function useRebalance({ holdings, aiInsights, insightsData }) {
  return useMemo(() => {
    return computeRebalance({
      holdings: holdings || [],
      aiInsights: aiInsights || {},
      brainIndex,
      insightsData: insightsData || {},
      today: new Date(),
    })
  }, [holdings, aiInsights, insightsData])
}
