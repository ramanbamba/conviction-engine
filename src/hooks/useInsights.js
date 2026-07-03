import { useMemo } from 'react'
import {
  getInsight,
  getUrgentPositions,
  getTopSignals,
  getRedFlags,
  computeInsightStats,
  getStaleInsights
} from '../lib/insightsEngine'

export function useInsights(insightsData) {
  const urgentPositions = useMemo(
    () => getUrgentPositions(insightsData),
    [insightsData]
  )

  const topSignals = useMemo(
    () => getTopSignals(insightsData, 6),
    [insightsData]
  )

  const redFlags = useMemo(
    () => getRedFlags(insightsData),
    [insightsData]
  )

  const stats = useMemo(
    () => computeInsightStats(insightsData),
    [insightsData]
  )

  const staleSyms = useMemo(
    () => getStaleInsights(insightsData),
    [insightsData]
  )

  return {
    urgentPositions,
    topSignals,
    redFlags,
    stats,
    staleSyms,
    getInsight: (sym) => getInsight(insightsData, sym)
  }
}
