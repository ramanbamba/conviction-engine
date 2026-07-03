/**
 * useCatalystDue
 *
 * Scans aiInsights.catalystAlerts for events due today or past-due (missed).
 * Returns a list of due alerts so the Cockpit can surface a "Results due today" prompt.
 *
 * Used by: MorningBriefTab (P4.2 — proactive catalyst logging prompt)
 *
 * Returns:
 *   dueToday   — catalystAlerts where date === today (show "Log results" CTA)
 *   overdue    — catalystAlerts where date < today and no logged outcome yet
 */

import { useMemo } from 'react'

export function useCatalystDue(aiInsights, decisionLedger = []) {
  return useMemo(() => {
    const alerts = aiInsights?.catalystAlerts ?? []
    if (!alerts.length) return { dueToday: [], overdue: [] }

    const today = new Date().toISOString().split('T')[0]

    // syms that already have a logged outcome in decisionLedger
    const closedSyms = new Set(
      decisionLedger.filter(e => e.outcome !== null).map(e => e.sym)
    )

    const dueToday = alerts.filter(a => a.date === today)
    const overdue  = alerts.filter(a => a.date < today && !closedSyms.has(a.stocks?.[0]))

    return { dueToday, overdue }
  }, [aiInsights, decisionLedger])
}
