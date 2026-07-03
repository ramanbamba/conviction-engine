/**
 * edgeAnalytics.js
 * Pure functions over memory.json — surfaces the decision intelligence layer.
 * All functions return safe defaults when data is absent.
 *
 * Note: memory uses 'convictionLog' (not 'convictionDrift').
 */

/**
 * Thesis hit rate: what % of T+30/T+90 verdicts were validated?
 * Looks at thesisLedger entries that have a 'verdict' field.
 */
export function hitRate(thesisLedger = []) {
  const withVerdict = thesisLedger.filter(t => t.verdict)
  if (withVerdict.length === 0) {
    return { validated: 0, invalidated: 0, total: 0, pct: null, byBucket: {} }
  }

  let validated = 0
  let invalidated = 0
  const byBucket = {}

  withVerdict.forEach(t => {
    const isValid = t.verdict === 'VALIDATED' || t.verdict === 'PARTIAL'
    if (isValid) validated++; else invalidated++

    const b = t.bucket || 'Unknown'
    if (!byBucket[b]) byBucket[b] = { validated: 0, invalidated: 0 }
    if (isValid) byBucket[b].validated++; else byBucket[b].invalidated++
  })

  return {
    validated,
    invalidated,
    total: withVerdict.length,
    pct: validated / withVerdict.length,
    byBucket,
  }
}

/**
 * Conviction drift map: recent changes from memory.convictionLog.
 */
export function convictionDriftMap(memory = {}) {
  // Support both field names for forward compatibility
  const log = memory.convictionLog || memory.convictionDrift || []
  return [...log].sort((a, b) => new Date(b.date) - new Date(a.date))
}

/**
 * Catalyst outcome log: recent decision ledger entries, sorted newest first.
 */
export function catalystOutcomeLog(decisionLedger = []) {
  return [...decisionLedger]
    .sort((a, b) => new Date(b.prePositionDate || b.date) - new Date(a.prePositionDate || a.date))
    .map(d => ({
      id:            d.id,
      sym:           d.sym,
      event:         d.eventLabel || d.event || '',
      date:          d.eventDate || d.prePositionDate || '',
      hasOutcome:    !!(d.outcome?.ltpAtOutcome),
      ltpAtOutcome:  d.outcome?.ltpAtOutcome ?? null,
      notes:         d.outcome?.resultData?.notes ?? null,
    }))
}

/**
 * Mistake patterns: classify trading mistakes from interruptBypass log.
 * Returns an array of { type, count, examples[] }.
 */
export function mistakePatterns(memory = {}) {
  const bypasses = memory.interruptBypass || []
  const counts = {}

  bypasses.forEach(b => {
    const type = b.pattern || 'OTHER'
    if (!counts[type]) counts[type] = { type, count: 0, examples: [] }
    counts[type].count++
    if (b.sym && !counts[type].examples.includes(b.sym)) {
      counts[type].examples.push(b.sym)
    }
  })

  return Object.values(counts).sort((a, b) => b.count - a.count)
}

/**
 * Discipline streak: days since last interruptBypass entry.
 */
export function disciplineStreak(memory = {}) {
  const bypasses = memory.interruptBypass || []

  if (bypasses.length === 0) {
    return {
      days: null,  // null = no bypass history, not "0 days clean"
      lastBypass: null,
    }
  }

  const sorted = [...bypasses].sort((a, b) => new Date(b.date) - new Date(a.date))
  const last = sorted[0]
  const daysSince = Math.floor((Date.now() - new Date(last.date)) / 86400000)

  return {
    days: daysSince,
    lastBypass: { date: last.date, pattern: last.pattern || '', sym: last.sym || null },
  }
}

/**
 * Build the headline string for the collapsed Edge panel header.
 * E.g. "Hit rate 62% · 12d clean"
 */
export function buildEdgeHeadline(hitRateData, streakData) {
  const parts = []

  if (hitRateData.total > 0) {
    parts.push(`Hit rate ${Math.round(hitRateData.pct * 100)}%`)
  }

  if (streakData.days !== null) {
    parts.push(`${streakData.days}d clean`)
  } else if (streakData.days === null && !streakData.lastBypass) {
    parts.push('No bypasses logged')
  }

  return parts.length > 0 ? parts.join(' · ') : 'No edge data yet'
}
