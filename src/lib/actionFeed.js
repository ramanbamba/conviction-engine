/**
 * actionFeed.js — the one ranked stream of "what needs you today."
 *
 * PHASE 10x · Phase 1. The product's worst noise is one signal shown many times:
 * PRAJIND appears in the Alert Register, the Landmine Radar, AND the PM decision —
 * three rows, one fact. This merges every attention source into a single
 * severity-ranked, de-duplicated feed, and is honestly SILENT when nothing needs
 * you (calibrated silence: loud on structural destroyers, quiet on optimisation).
 *
 * Dedup rule: one row per symbol, at its highest severity, with the other sources
 * folded in as tags. Symbols already surfaced as ratifiable PM decisions (ACT) are
 * EXCLUDED — they live above the feed with their own ratify/veto controls.
 *
 * Deadband (the over-trading guard from the triad review): this feed carries
 * ATTENTION (risk · stops · catalysts), never "you're 1% off target" nagging.
 * Allocation drift is Phase 2's job and is north-star, not a daily mandate.
 *
 * buildActionFeed({ landmineScan, alerts, catalysts, decisionSyms }) → {
 *   items:[{sym,tier,sevRank,label,text,tags}], counts, quiet
 * }
 */

const TIER = {
  CUT:   { rank: 4, label: 'CUT',   cls: 'text-red border-red/30 bg-red/10' },
  STOP:  { rank: 3, label: 'STOP',  cls: 'text-red border-red/25 bg-red/5' },
  WATCH: { rank: 2, label: 'WATCH', cls: 'text-amber border-amber/25 bg-amber/5' },
  AWAIT: { rank: 1, label: 'AWAIT', cls: 'text-teal border-teal/25 bg-teal/5' },
}

export const TIER_META = TIER

export function buildActionFeed({ landmineScan = { critical: [], warning: [] }, alerts = [], catalysts = [], watchItems = [], decisionSyms = [] } = {}) {
  const excluded = new Set(decisionSyms)            // already ratifiable above the feed
  const bySym = new Map()                            // dedup: highest severity wins

  const push = (sym, tier, text, tag) => {
    if (!sym || excluded.has(sym)) return
    const existing = bySym.get(sym)
    if (!existing) {
      bySym.set(sym, { sym, tier, sevRank: TIER[tier].rank, label: TIER[tier].label, text, tags: tag ? [tag] : [] })
      return
    }
    // merge: keep the higher-severity row, fold this source in as a tag
    if (TIER[tier].rank > existing.sevRank) {
      bySym.set(sym, { sym, tier, sevRank: TIER[tier].rank, label: TIER[tier].label, text, tags: [...new Set([...existing.tags, ...(tag ? [tag] : [])])] })
    } else if (tag && !existing.tags.includes(tag)) {
      existing.tags.push(tag)
    }
  }

  // 1. Landmine criticals → CUT (structural break at size — always loud)
  for (const r of landmineScan.critical || []) {
    push(r.sym, 'CUT', r.headline || 'structural break at size', r.flags?.[0]?.type)
  }

  // 2. Stop-loss alerts → STOP (breach) / WATCH (near)
  for (const a of alerts) {
    if (a.type === 'BREACH' || a.type === 'EXIT') push(a.sym, 'STOP', a.text?.replace(/^CRITICAL: |^EXIT /, '') || 'stop breached', 'stop')
    else if (a.type === 'NEAR_SL') push(a.sym, 'WATCH', a.text?.replace(/^Warning: /, '') || 'near stop', 'near-stop')
  }

  // 3. Landmine warnings → WATCH (fragile but contained)
  for (const r of landmineScan.warning || []) {
    push(r.sym, 'WATCH', r.headline || 'fragile — contained', r.flags?.[0]?.type)
  }

  // 3b. PM watch items (thesis-level monitoring) → WATCH, tagged honestly
  for (const w of watchItems) {
    push(w.sym, 'WATCH', w.text || 'thesis watch', 'thesis')
  }

  // 4. Catalysts within window → AWAIT
  for (const c of catalysts) {
    const sym = c.sym || (c.syms && c.syms[0])
    push(sym, 'AWAIT', c.text || c.headline || c.event || 'catalyst due', 'catalyst')
  }

  const items = [...bySym.values()].sort((a, b) => b.sevRank - a.sevRank || a.sym.localeCompare(b.sym))
  const counts = {
    cut: items.filter(i => i.tier === 'CUT').length,
    stop: items.filter(i => i.tier === 'STOP').length,
    watch: items.filter(i => i.tier === 'WATCH').length,
    await: items.filter(i => i.tier === 'AWAIT').length,
  }
  // Calibrated silence: "quiet" when nothing demands action (only AWAIT/empty)
  const quiet = counts.cut === 0 && counts.stop === 0 && counts.watch === 0

  return { items, counts, quiet, total: items.length }
}
