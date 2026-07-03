// Insights Engine — pure functions for consuming insights.json
// Insights are seeded by analysis and refreshed monthly via scripts/refresh-insights.js

export const THESIS_STATUS = {
  INTACT:    'intact',
  WATCH:     'watch',
  WEAKENING: 'weakening',
  BROKEN:    'broken'
}

export const ACTION_BIAS = {
  ADD:   'ADD',
  HOLD:  'HOLD',
  TRIM:  'TRIM',
  EXIT:  'EXIT',
  WATCH: 'WATCH'
}

// Urgency order for sorting
const URGENCY_ORDER  = { high: 0, medium: 1, low: 2 }
const STATUS_ORDER   = { broken: 0, weakening: 1, watch: 2, intact: 3 }
const FLAG_ORDER     = { red: 0, amber: 1, neutral: 2, green: 3 }
const ACTION_URGENCY = { EXIT: 0, WATCH: 1, TRIM: 2, ADD: 3, HOLD: 4 }

// Returns insight for a single symbol
export function getInsight(insights, sym) {
  return insights?.positions?.[sym] ?? null
}

// Returns all positions with high urgency or thesis not intact
export function getUrgentPositions(insights) {
  if (!insights?.positions) return []
  return Object.values(insights.positions)
    .filter(p => p.urgency === 'high' || p.thesisStatus !== 'intact')
    .sort((a, b) =>
      STATUS_ORDER[a.thesisStatus] - STATUS_ORDER[b.thesisStatus] ||
      URGENCY_ORDER[a.urgency]     - URGENCY_ORDER[b.urgency]
    )
}

// Returns top N signals across all positions, sorted by flag severity
export function getTopSignals(insights, n = 5) {
  if (!insights?.positions) return []
  const all = []
  for (const pos of Object.values(insights.positions)) {
    for (const sig of [...(pos.signals || []), ...(pos.risks || [])]) {
      all.push({ sym: pos.sym, name: pos.name, ...sig })
    }
  }
  return all
    .sort((a, b) => FLAG_ORDER[a.flag] - FLAG_ORDER[b.flag])
    .slice(0, n)
}

// Returns positions sorted by urgency + thesis status — for morning brief ordering
export function sortByUrgency(insights, syms) {
  return [...syms].sort((a, b) => {
    const ia = insights?.positions?.[a]
    const ib = insights?.positions?.[b]
    if (!ia && !ib) return 0
    if (!ia) return 1
    if (!ib) return -1
    return (
      STATUS_ORDER[ia.thesisStatus] - STATUS_ORDER[ib.thesisStatus] ||
      ACTION_URGENCY[ia.actionBias] - ACTION_URGENCY[ib.actionBias] ||
      URGENCY_ORDER[ia.urgency]     - URGENCY_ORDER[ib.urgency]
    )
  })
}

// Returns positions due for a refresh (refreshDue < today)
export function getStaleInsights(insights) {
  if (!insights?.positions) return []
  const today = new Date()
  return Object.values(insights.positions)
    .filter(p => p.refreshDue && new Date(p.refreshDue) < today)
    .map(p => p.sym)
}

// Returns red flags across the portfolio — the most actionable surface
export function getRedFlags(insights) {
  if (!insights?.positions) return []
  const flags = []
  for (const pos of Object.values(insights.positions)) {
    const reds = [...(pos.signals || []), ...(pos.risks || [])].filter(s => s.flag === 'red')
    if (reds.length) flags.push({ sym: pos.sym, name: pos.name, flags: reds })
  }
  return flags
}

// Summary stats across the portfolio
export function computeInsightStats(insights) {
  if (!insights?.positions) return {}
  const all = Object.values(insights.positions)
  return {
    total:        all.length,
    intact:       all.filter(p => p.thesisStatus === 'intact').length,
    watch:        all.filter(p => p.thesisStatus === 'watch').length,
    weakening:    all.filter(p => p.thesisStatus === 'weakening').length,
    broken:       all.filter(p => p.thesisStatus === 'broken').length,
    exitBias:     all.filter(p => p.actionBias === 'EXIT').length,
    addBias:      all.filter(p => p.actionBias === 'ADD').length,
    trimBias:     all.filter(p => p.actionBias === 'TRIM').length,
    highUrgency:  all.filter(p => p.urgency === 'high').length,
    redFlagCount: all.reduce((s, p) =>
      s + [...(p.signals||[]), ...(p.risks||[])].filter(f => f.flag === 'red').length, 0)
  }
}
