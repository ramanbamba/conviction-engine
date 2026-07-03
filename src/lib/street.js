// ─── Street view ────────────────────────────────────────────────────────────
// Reads street.json (brokerage ratings/TPs + catalysts) into derived views:
// per-stock consensus TP, and a book-wide recency feed of what the street did.
// The "30-day intelligence sweep" made into a repeatable, freshness-tracked data
// shape so the intelligence never silently goes stale.
// ────────────────────────────────────────────────────────────────────────────

const DAY = 86400000

export function daysBetween(a, b) {
  if (!a || !b) return null
  return Math.round((new Date(b) - new Date(a)) / DAY)
}

// Mean of active broker TPs for a stock
export function consensusTP(view) {
  if (!view?.brokers?.length) return null
  const tps = view.brokers.map(b => b.tp).filter(t => t != null && t > 0)
  if (!tps.length) return null
  return Math.round(tps.reduce((s, t) => s + t, 0) / tps.length)
}

export const RATING_RANK = { BUY: 2, ADD: 1, ACCUMULATE: 1, HOLD: 0, REDUCE: -1, SELL: -2 }

export function consensusRating(view) {
  if (!view?.brokers?.length) return null
  const ranks = view.brokers.map(b => RATING_RANK[(b.rating || '').toUpperCase()] ?? 0)
  const avg = ranks.reduce((s, r) => s + r, 0) / ranks.length
  return avg >= 1.3 ? 'BUY' : avg >= 0.4 ? 'ADD' : avg <= -1.3 ? 'SELL' : avg <= -0.4 ? 'REDUCE' : 'HOLD'
}

export const IMPACT_META = {
  HIGH: { cls: 'text-red border-red/30 bg-red/10' },
  MED:  { cls: 'text-amber border-amber/30 bg-amber/10' },
  LOW:  { cls: 'text-zinc-400 border-white/10 bg-white/5' },
}

export const CATALYST_ICON = {
  ORDER: '◆', RESULT: '▣', COVERAGE: '◈', GUIDANCE: '◉',
  DIVIDEND: '₹', EVENT: '◷', REGULATORY: '⚖', PRICE: '↕', default: '•',
}

// Per-stock derived view (consensus + sorted broker list + catalysts)
export function getStreetView(streetData, sym) {
  const v = streetData?.stocks?.[sym]
  if (!v) return null
  const asOf = streetData.asOf
  return {
    sym,
    brokers: [...(v.brokers || [])].sort((a, b) => new Date(b.date) - new Date(a.date)),
    catalysts: [...(v.catalysts || [])].sort((a, b) => new Date(b.date) - new Date(a.date)),
    consensusTP: consensusTP(v),
    consensusRating: consensusRating(v),
    lastEvent: [...(v.brokers || []).map(b => b.date), ...(v.catalysts || []).map(c => c.date)]
      .sort().reverse()[0] || null,
    asOf,
  }
}

// Book-wide recency feed: every broker action + catalyst across held symbols,
// newest first, each tagged with sym, recency, and a FRESH flag (<= 10 days).
export function buildStreetFeed(streetData, heldSyms = null) {
  if (!streetData?.stocks) return []
  const asOf = streetData.asOf
  const held = heldSyms ? new Set(heldSyms) : null
  const items = []

  for (const [sym, v] of Object.entries(streetData.stocks)) {
    if (held && !held.has(sym)) continue
    for (const b of (v.brokers || [])) {
      items.push({
        sym, kind: 'RATING', date: b.date, age: daysBetween(b.date, asOf),
        broker: b.name, rating: b.rating, tp: b.tp, note: b.note,
        headline: `${b.name} ${b.rating}${b.tp ? ` · TP ₹${b.tp}` : ''}${b.note ? ` — ${b.note}` : ''}`,
        impact: 'MED',
      })
    }
    for (const c of (v.catalysts || [])) {
      items.push({
        sym, kind: 'CATALYST', date: c.date, age: daysBetween(c.date, asOf),
        type: c.type, headline: c.headline, impact: c.impact || 'LOW',
      })
    }
  }

  return items.sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(it => ({ ...it, fresh: it.age != null && it.age >= 0 && it.age <= 10, upcoming: it.age != null && it.age < 0 }))
}
