/**
 * keeperTest.js — the buy-and-forget filter.
 *
 * For every non-model holding: would you buy this and forget it for 3-5 years?
 * That verdict is your churn list. Platinum + Power Alpha are locked models
 * (exempt); Hedge + Cash are strategic insurance (exempt).
 *
 * verdict: 'KEEP' | 'WATCH' | 'CHURN' | 'MODEL' | 'STRATEGIC'
 */

const MODEL_BUCKETS = new Set(['Platinum', 'Power Alpha'])
const STRATEGIC_BUCKETS = new Set(['Hedge', 'Cash'])

export function keeperVerdict(holding, rearview = {}) {
  if (!holding) return null
  const bucket = holding.bucket
  if (MODEL_BUCKETS.has(bucket)) {
    return { verdict: 'MODEL', reason: `${bucket} is a locked model — exempt from the keeper test.` }
  }
  if (STRATEGIC_BUCKETS.has(bucket)) {
    return { verdict: 'STRATEGIC', reason: `${bucket} is strategic insurance — held by design, not conviction.` }
  }

  const conv = Number(holding.conv ?? 0)
  const pnlPct = Number(holding.pnlPct ?? 0)
  const rt = (rearview.roundTrippers || []).find(r => r.symbol === holding.sym)

  // Deep-underwater + weak conviction = broken, churn regardless
  if (pnlPct < -0.25 && conv < 7) {
    return { verdict: 'CHURN', reason: `Down ${(pnlPct * 100).toFixed(0)}% with conviction ${conv} — broken thesis. Recycle into a keeper.` }
  }
  if (conv <= 5) {
    return { verdict: 'CHURN', reason: `Conviction ${conv} — fails buy-and-forget. Churn candidate.` }
  }
  if (conv >= 8 && pnlPct > -0.20) {
    const note = rt ? ` (you've round-tripped it ${rt.entries}× — now hold it)` : ''
    return { verdict: 'KEEP', reason: `Conviction ${conv} — a buy-and-forget name${note}. Hold for years.` }
  }
  return { verdict: 'WATCH', reason: `Conviction ${conv} — borderline. Fix the thesis or let it earn its place.` }
}

// Verdict → display config (palette-compliant)
export const KEEPER_STYLE = {
  KEEP:      { label: 'KEEP',  cls: 'text-green',  bg: 'bg-green/10 border-green/20' },
  WATCH:     { label: 'WATCH', cls: 'text-amber',  bg: 'bg-amber/10 border-amber/20' },
  CHURN:     { label: 'CHURN', cls: 'text-red',    bg: 'bg-red/10 border-red/20' },
  MODEL:     { label: 'MODEL', cls: 'text-teal',   bg: 'bg-teal/10 border-teal/20' },
  STRATEGIC: { label: 'HEDGE', cls: 'text-zinc-500', bg: 'bg-white/5 border-white/10' },
}
