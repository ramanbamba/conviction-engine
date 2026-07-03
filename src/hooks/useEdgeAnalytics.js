import { useMemo } from 'react'
import {
  hitRate,
  convictionDriftMap,
  catalystOutcomeLog,
  mistakePatterns,
  disciplineStreak,
  buildEdgeHeadline,
} from '../lib/edgeAnalytics'

/**
 * useEdgeAnalytics(memory, holdings)
 * Surfaces the decision intelligence layer from memory.json.
 * All fields return safe defaults — never throws on absent data.
 */
export function useEdgeAnalytics(memory = {}, holdings = []) {
  return useMemo(() => {
    const hitRateData   = hitRate(memory.thesisLedger)
    const streakData    = disciplineStreak(memory)

    return {
      hitRate:            hitRateData,
      convictionDriftMap: convictionDriftMap(memory),
      catalystLog:        catalystOutcomeLog(memory.decisionLedger),
      mistakePatterns:    mistakePatterns(memory),
      disciplineStreak:   streakData,
      bypassLog:          (memory.interruptBypass || []).slice().reverse(),
      headline:           buildEdgeHeadline(hitRateData, streakData),
    }
  }, [memory, holdings])
}
