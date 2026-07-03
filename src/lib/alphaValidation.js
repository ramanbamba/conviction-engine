// ─── Alpha model validation ──────────────────────────────────────────────────
// The loop on top of the model (ALPHA_MODEL.md §4). Grades the model on its own
// recorded calls: take a baseline snapshot, measure each name's forward return to
// a later snapshot, group by the tier AT BASELINE, and check that realized return
// is monotonic in tier (STRONG > POSITIVE > NEUTRAL > NEGATIVE).
//
// This is the proof that earns the right to concentrate. No proof → no leverage
// on the model's word.
// ────────────────────────────────────────────────────────────────────────────

export const TIER_ORDER = ['STRONG', 'POSITIVE', 'NEUTRAL', 'NEGATIVE']

export const TIER_META = {
  STRONG:   { rank: 3, color: '#10B981', cls: 'text-green' },
  POSITIVE: { rank: 2, color: '#14B8A6', cls: 'text-teal' },
  NEUTRAL:  { rank: 1, color: '#a1a1aa', cls: 'text-zinc-400' },
  NEGATIVE: { rank: 0, color: '#EF4444', cls: 'text-red' },
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

// Build a { sym: ltp } map from a snapshot's rows
const priceMap = (snap) => Object.fromEntries((snap.rows || []).map(r => [r.sym, r.ltp]))

/**
 * Grade one baseline snapshot against a later "current" price set.
 * @param baseline snapshot { asOf, rows:[{sym,tier,score,ltp,conv}] }
 * @param current  snapshot used only for its prices
 * @returns { window, byTier:{TIER:{n,avgRet,names}}, monotonic, spread, names:[...] }
 */
export function gradeSnapshot(baseline, current) {
  if (!baseline || !current) return null
  const curPrice = priceMap(current)
  const window = daysBetween(baseline.asOf, current.asOf)

  const names = []
  for (const r of baseline.rows || []) {
    const from = r.ltp, to = curPrice[r.sym]
    if (from == null || to == null || from <= 0) continue
    names.push({ sym: r.sym, tier: r.tier, score: r.score, conv: r.conv, ret: (to - from) / from })
  }

  const byTier = {}
  for (const t of TIER_ORDER) {
    const rows = names.filter(n => n.tier === t)
    byTier[t] = rows.length
      ? { n: rows.length, avgRet: rows.reduce((s, x) => s + x.ret, 0) / rows.length, names: rows.map(x => x.sym) }
      : { n: 0, avgRet: null, names: [] }
  }

  // Monotonicity across the tiers that actually have data
  const present = TIER_ORDER.filter(t => byTier[t].n > 0)
  let monotonic = true
  for (let i = 0; i < present.length - 1; i++) {
    if (byTier[present[i]].avgRet < byTier[present[i + 1]].avgRet) { monotonic = false; break }
  }
  const top = byTier.STRONG.avgRet, bot = byTier.NEGATIVE.avgRet ?? byTier.NEUTRAL.avgRet
  const spread = top != null && bot != null ? top - bot : null

  // Concentration-relevant metric: do the model's best names beat the book?
  const bookAvg = names.length ? names.reduce((s, x) => s + x.ret, 0) / names.length : null
  const strongEdge = top != null && bookAvg != null ? top - bookAvg : null

  return { baselineDate: baseline.asOf, currentDate: current.asOf, window, byTier, monotonic, spread, bookAvg, strongEdge, names }
}

/**
 * Run validation over the full history: earliest snapshot as baseline,
 * latest as current (maximises the forward window).
 * @param history { snapshots: [...] }
 * @param liveLtp optional { sym: ltp } to use as the "current" prices instead of
 *                the latest snapshot (fresher).
 */
export function validateAlpha(history, liveLtp = null) {
  const snaps = [...(history?.snapshots || [])].sort((a, b) => new Date(a.asOf) - new Date(b.asOf))
  if (snaps.length < 2) {
    return { ready: false, reason: snaps.length ? 'Need a second snapshot to measure forward returns.' : 'No snapshots yet.', snapshots: snaps.length }
  }
  const baseline = snaps[0]
  const current = liveLtp
    ? { asOf: new Date().toISOString().split('T')[0], rows: Object.entries(liveLtp).map(([sym, ltp]) => ({ sym, ltp })) }
    : snaps[snaps.length - 1]

  const grade = gradeSnapshot(baseline, current)
  if (!grade) return { ready: false, reason: 'Could not grade snapshots.', snapshots: snaps.length }

  // Verdict: monotonic + meaningful positive spread = proven; window matters for confidence
  let verdict, tone
  if (grade.window < 21) { verdict = 'EARLY'; tone = 'neutral' }
  else if (grade.monotonic && grade.spread > 0.03) { verdict = 'PROVEN'; tone = 'good' }
  else if (grade.spread != null && grade.spread > 0) { verdict = 'PARTIAL'; tone = 'neutral' }
  else { verdict = 'UNPROVEN'; tone = 'bad' }

  return { ready: true, ...grade, verdict, tone, snapshots: snaps.length }
}
