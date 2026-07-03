/**
 * rebalanceEngine.js
 *
 * Static rebalance scoring engine driven by the 10-dimension conviction model.
 *
 * Input:
 *   holdings         — enriched holdings from usePortfolio (with sym, bucket, conv, value, tgtVal, ltp, exitSignal, theme)
 *   aiInsights       — ai-insights.json (uses stocks[sym].positionSizing + stocks[sym].catalysts)
 *   brainIndex       — brain-index.json (uses convictionBreakdown for weakest-dimension analysis)
 *   insightsData     — insights.json (uses positions[sym].computedTechnicals.rsi14 + vsSma200Pct for momentum)
 *
 * Output:
 *   { doubleDown, hold, trim, churn, excluded, meta }
 *   each list is array of:
 *     { sym, name, bucket, action, conviction, sizingPct, sizingGapPct, daysToCatalyst,
 *       catalyst, weakestDimensions, momentum, driver, value, tgtVal }
 *
 * Excluded buckets: Hedge, Cash, Satellites — these are insurance/strategic
 * positions, not active capital-allocation decisions.
 */

import { getBrainEntry, parseDimensions } from './brainIndexParser.js'

const EXCLUDED_BUCKETS = new Set(['Hedge', 'Cash', 'Satellites'])

const DIM_LABELS = {
  earningsGrowth:      'Earnings',
  balanceSheet:        'Balance Sheet',
  mgmtQuality:         'Mgmt',
  valuationHeadroom:   'Valuation',
  orderBookVisibility: 'Order Book',
  competitiveMoat:     'Moat',
  catalystProximity:   'Catalyst',
  downsideProtection:  'Downside',
  sectorTailwind:      'Sector',
  governance:          'Governance',
}

/**
 * Parse "YYYY-MM-DD" or "YYYY-MM" or "YYYY" into a Date.
 * Returns null on failure. Partial dates default to start of period.
 */
function parseCatalystDate(str) {
  if (!str || typeof str !== 'string') return null
  const parts = str.split('-')
  if (parts.length === 1) return new Date(`${parts[0]}-01-01`)
  if (parts.length === 2) return new Date(`${parts[0]}-${parts[1]}-01`)
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Find nearest future catalyst. Returns {date, event, impact, daysOut} or null.
 */
function nearestCatalyst(catalysts, today) {
  if (!Array.isArray(catalysts) || catalysts.length === 0) return null
  const t = today.getTime()
  let best = null
  for (const c of catalysts) {
    const d = parseCatalystDate(c.date)
    if (!d) continue
    const days = Math.round((d.getTime() - t) / 86400000)
    if (days < 0) continue
    if (!best || days < best.daysOut) {
      best = { date: c.date, event: c.event, impact: c.impact, daysOut: days }
    }
  }
  return best
}

/**
 * Compute momentum bucket from technicals.
 * Returns one of: 'STRONG' | 'NEUTRAL' | 'WEAK' | 'UNKNOWN'
 */
function computeMomentum(tech) {
  if (!tech) return 'UNKNOWN'
  const { rsi14, vsSma200Pct, vsSma50Pct } = tech
  if (rsi14 == null && vsSma200Pct == null) return 'UNKNOWN'
  let score = 0
  if (rsi14 != null) {
    if (rsi14 >= 55 && rsi14 <= 70) score += 1
    else if (rsi14 < 40) score -= 1
  }
  if (vsSma200Pct != null) {
    if (vsSma200Pct > 5) score += 1
    else if (vsSma200Pct < -5) score -= 1
  }
  if (vsSma50Pct != null) {
    if (vsSma50Pct > 0) score += 0.5
    else score -= 0.5
  }
  if (score >= 1.5) return 'STRONG'
  if (score <= -1) return 'WEAK'
  return 'NEUTRAL'
}

/**
 * Identify weakest dimensions (score ≤ 5). Returns sorted asc by score, max 3.
 */
function weakestDims(dimensions) {
  if (!dimensions) return []
  return Object.entries(dimensions)
    .filter(([, v]) => v !== null && v !== undefined && v <= 5)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 3)
    .map(([key, value]) => ({ key, label: DIM_LABELS[key] || key, value }))
}

/**
 * Build the driver one-liner for the given action.
 */
function buildDriver(action, ctx) {
  const { conviction, sizingPct, sizingGapPct, catalyst, weakestDimensions, momentum, exitSignal } = ctx
  const convStr = `Conv ${conviction.toFixed(1)}`
  const sizeStr = `${sizingPct.toFixed(0)}% of target`

  switch (action) {
    case 'DOUBLE_DOWN': {
      const parts = [convStr, sizeStr]
      if (catalyst && catalyst.daysOut <= 60) {
        parts.push(`catalyst in ${catalyst.daysOut}d`)
      }
      if (momentum === 'STRONG') parts.push('momentum strong')
      return parts.join(' · ')
    }
    case 'HOLD': {
      const parts = [convStr, sizeStr]
      if (momentum === 'WEAK') parts.push('momentum weak')
      return parts.join(' · ')
    }
    case 'TRIM': {
      const overBy = (sizingPct - 100).toFixed(0)
      return `Overweight +${overBy}% · ${convStr}`
    }
    case 'CHURN': {
      if (exitSignal) return `Exit signal active · ${convStr}`
      const parts = [convStr]
      if (weakestDimensions.length > 0) {
        const dimList = weakestDimensions.map(d => `${d.label} ${d.value}`).join(', ')
        parts.push(`weak on ${dimList}`)
      }
      if (momentum === 'WEAK') parts.push('momentum weak')
      return parts.join(' · ')
    }
    default:
      return convStr
  }
}

/**
 * Assign an action bucket to a holding. Order of precedence matters.
 */
function assignAction({ exitSignal, conviction, sizingGapPct, weakestDimensions }) {
  // Hard exit: Advisor-flagged or conviction below threshold
  if (exitSignal) return 'CHURN'
  if (conviction <= 5) return 'CHURN'
  // 3+ weak dimensions = structural concern even if headline conviction is OK
  if (weakestDimensions.length >= 3) return 'CHURN'

  // Overweight by >10% relative to target → TRIM (regardless of conviction)
  if (sizingGapPct > 10) return 'TRIM'

  // Soft-watch: conviction in 5-7 band → TRIM if not already at target
  if (conviction < 6.5 && sizingGapPct > -10) return 'TRIM'

  // High conviction + room to add → DOUBLE_DOWN
  if (conviction >= 8 && sizingGapPct < 5) return 'DOUBLE_DOWN'

  // Default: HOLD
  return 'HOLD'
}

/**
 * Main entry point. Returns the categorised rebalance ladder.
 */
export function computeRebalance({ holdings = [], aiInsights = {}, brainIndex = {}, insightsData = {}, today = new Date() }) {
  const doubleDown = []
  const hold = []
  const trim = []
  const churn = []
  const excluded = []

  for (const h of holdings) {
    if (EXCLUDED_BUCKETS.has(h.bucket)) {
      excluded.push({ sym: h.sym, name: h.name, bucket: h.bucket })
      continue
    }

    const aiStock = aiInsights?.stocks?.[h.sym] || {}
    const techPosition = insightsData?.positions?.[h.sym]
    const tech = techPosition?.computedTechnicals || aiStock.technicals
    const brainEntry = getBrainEntry(brainIndex, h.sym)
    const dimensions = brainEntry ? parseDimensions(brainEntry.convictionBreakdown) : null

    // Sizing — prefer ai-insights positionSizing if present (lakhs-accurate), else fall back to holding
    const value = aiStock.positionSizing?.currentValue ?? h.value ?? 0
    const tgtVal = aiStock.positionSizing?.targetValue ?? h.tgtVal ?? 0
    const sizingPct = tgtVal > 0 ? (value / tgtVal) * 100 : 0
    const sizingGapPct = sizingPct - 100

    const catalyst = nearestCatalyst(aiStock.catalysts, today)
    const daysToCatalyst = catalyst ? catalyst.daysOut : null
    const weakestDimensions = weakestDims(dimensions)
    const momentum = computeMomentum(tech)
    const exitSignal = h.exitSignal === true
    const conviction = Number(h.conv ?? brainEntry?.conviction ?? aiStock.conviction ?? 0)

    const action = assignAction({ exitSignal, conviction, sizingGapPct, weakestDimensions })
    const ctx = { conviction, sizingPct, sizingGapPct, catalyst, weakestDimensions, momentum, exitSignal }
    const driver = buildDriver(action, ctx)

    const row = {
      sym: h.sym,
      name: h.name,
      bucket: h.bucket,
      action,
      conviction,
      sizingPct,
      sizingGapPct,
      value,
      tgtVal,
      catalyst,
      daysToCatalyst,
      weakestDimensions,
      momentum,
      driver,
      exitSignal,
      dims: dimensions,
    }

    if (action === 'DOUBLE_DOWN') doubleDown.push(row)
    else if (action === 'HOLD') hold.push(row)
    else if (action === 'TRIM') trim.push(row)
    else if (action === 'CHURN') churn.push(row)
  }

  // Sort each list per its priority rule
  doubleDown.sort((a, b) => {
    // Sooner catalyst first; null catalyst goes last
    const ad = a.daysToCatalyst ?? 9999
    const bd = b.daysToCatalyst ?? 9999
    if (ad !== bd) return ad - bd
    return b.conviction - a.conviction
  })
  hold.sort((a, b) => b.conviction - a.conviction)
  trim.sort((a, b) => b.sizingGapPct - a.sizingGapPct)
  churn.sort((a, b) => {
    if (a.exitSignal !== b.exitSignal) return a.exitSignal ? -1 : 1 // exit signal first
    if (a.conviction !== b.conviction) return a.conviction - b.conviction
    return b.value - a.value
  })

  return {
    doubleDown,
    hold,
    trim,
    churn,
    excluded,
    meta: {
      generatedAt: today.toISOString(),
      total: doubleDown.length + hold.length + trim.length + churn.length,
      excludedCount: excluded.length,
    },
  }
}
