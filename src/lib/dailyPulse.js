/**
 * dailyPulse.js
 * Builds the 3-5 bullet strings for the DailyPulseStrip component.
 *
 * Sources:
 *   signals.json  — flagged stocks + per-stock reasons
 *   aiInsights.weeklyUpdate.weekSummary — AI's weekly narrative (first sentence)
 *
 * Returns an array of { text, type } where type drives color:
 *   'risk'    → text-red   (SL proximity, exit signal, catalyst risk)
 *   'signal'  → text-green (new buy, catalyst near, positive)
 *   'neutral' → text-zinc-400
 */

const MAX_BULLETS = 5

/**
 * @param {Object} signals    - signals.json content
 * @param {Object} aiInsights - ai-insights.json content
 * @returns {Array<{ text: string, type: 'risk'|'signal'|'neutral' }>}
 */
export function buildDailyPulse(signals, aiInsights) {
  const bullets = []

  // ── 1. Flagged stocks from signals.json ──
  const stockSignals = signals?.stocks ?? {}
  const flagged = signals?.flagged ?? []

  for (const sym of flagged) {
    if (bullets.length >= MAX_BULLETS - 1) break   // leave room for weekSummary
    const entry = stockSignals[sym]
    if (!entry) continue

    const signalTypes = Array.isArray(entry.signals) ? entry.signals : []
    const reasons     = Array.isArray(entry.reasons) ? entry.reasons : []

    // Pick the most concise reason (first, trimmed to 80 chars)
    const reason = reasons[0]?.replace(/\*\*/g, '')?.trim()?.slice(0, 80) ?? null
    const text   = reason ? `${sym} — ${reason}` : sym

    // Determine visual type
    const isRisk = signalTypes.some(s => ['slProximity', 'exitSignal', 'bearSignal'].includes(s))
      || (entry.slProximityPct != null && entry.slProximityPct < 5)
    const isPositive = signalTypes.some(s => ['newBuy', 'catalystNear'].includes(s)) && !isRisk

    bullets.push({ text, type: isRisk ? 'risk' : isPositive ? 'signal' : 'neutral' })
  }

  // ── 2. Weekly summary first sentence ──
  const weekSummary = aiInsights?.weeklyUpdate?.weekSummary
  if (weekSummary && bullets.length < MAX_BULLETS) {
    // Extract first sentence (stop at period + space, or 120 chars)
    const clean = weekSummary.replace(/\*\*/g, '').trim()
    const m = clean.match(/^([^.!?]+[.!?])/)
    const snippet = m ? m[1].trim().slice(0, 120) : clean.slice(0, 120)
    if (snippet.length > 15) {
      bullets.push({ text: snippet, type: 'neutral' })
    }
  }

  // ── 3. Stable state fallback ──
  if (bullets.length === 0) {
    bullets.push({ text: 'All clear — no signals today', type: 'neutral' })
  }

  return bullets
}
