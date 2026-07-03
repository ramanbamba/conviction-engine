import { today, daysBetween } from '../lib/date'

/**
 * FreshnessChip — the staleness contract, enforced at the UI.
 * The product must never look fresher than it is. Renders nothing while data is
 * inside its freshness window; past it, an amber age chip; past 3× the window, red.
 *
 * @param {string} asOf      ISO date/timestamp the data was generated
 * @param {number} maxFresh  days the data is considered fresh (default 7)
 * @param {string} hint      optional refresh instruction shown in the tooltip
 */
export default function FreshnessChip({ asOf, maxFresh = 7, hint }) {
  if (!asOf) return null
  const age = daysBetween(String(asOf).split('T')[0], today())
  if (!Number.isFinite(age) || age <= maxFresh) return null
  const severe = age > maxFresh * 3
  return (
    <span
      title={hint ? `${age} days old — ${hint}` : `${age} days old`}
      className={`text-nano font-mono font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
        severe ? 'text-red bg-red/10 border-red/25' : 'text-amber bg-amber/10 border-amber/25'
      }`}
    >
      {age}d old
    </span>
  )
}
