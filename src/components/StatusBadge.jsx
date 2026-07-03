/**
 * P6-5: Unified StatusBadge component
 *
 * Replaces 3+ inline implementations of urgency/severity badges.
 * Single source of truth for badge color semantics.
 *
 * Props:
 *   label   — string   — text to display (shown as-is, uppercased by CSS)
 *   variant — string   — one of the VARIANT_MAP keys (auto-detected from label if omitted)
 *   size    — 'sm'|'md' — controls padding/font size
 *
 * Color protocol (P6-7):
 *   CRITICAL / TODAY       → red  (action required NOW)
 *   HIGH / TOMORROW        → orange (elevated, not immediate)
 *   THIS_WEEK / MED        → amber  (monitor)
 *   BUILDING / THIS_MONTH  → blue   (informational)
 *   LOW / HOLD / MONITOR   → gray
 *   TRIGGERED / STABLE     → green
 *   NEAR_COMPLETE          → teal
 */
export const VARIANT_MAP = {
  // Severity
  CRITICAL:       'bg-red/15 text-red border-red/30',
  HIGH:           'bg-amber/10 text-amber border-amber/20',
  MED:            'bg-amber/15 text-amber border-amber/30',
  LOW:            'bg-white/5 text-text-dim border-white/10',
  // Urgency
  TODAY:          'bg-red/15 text-red border-red/30 animate-pulse',
  TOMORROW:       'bg-amber/10 text-amber border-amber/20',
  THIS_WEEK:      'bg-amber/15 text-amber border-amber/30',
  THIS_MONTH:     'bg-zinc-800 text-zinc-400 border-zinc-700',
  AFTER:          'bg-white/5 text-text-dim border-white/10',
  // Bucket status
  CRITICAL_UNDERFUND: 'bg-red/15 text-red border-red/30',
  NEAR_COMPLETE:  'bg-green/10 text-green border-green/20',
  BUILDING:       'bg-zinc-800 text-zinc-400 border-zinc-700',
  HOLD:           'bg-white/5 text-text-dim border-white/10',
  // FII / Trigger status
  TRIGGERED:      'bg-green/10 text-green border-green/20',
  ON_TRACK:       'bg-green/10 text-green border-green/20',
  PARTIAL:        'bg-amber/10 text-amber border-amber/20',
  WATCH:          'bg-amber/10 text-amber border-amber/20',
  NOT_TRIGGERED:  'bg-white/5 text-text-dim border-white/10',
  PENDING:        'bg-white/5 text-text-dim border-white/10',
  // Action tags
  'BUY NOW':      'bg-green/10 text-green border-green/20',
  BUY:            'bg-green/10 text-green border-green/20',
  BUILD:          'bg-zinc-800 text-zinc-400 border-zinc-700',
  HEDGE:          'bg-amber/10 text-amber border-amber/20',
  WATCH_TAG:      'bg-white/5 text-text-dim border-white/10',
  EXIT:           'bg-red/15 text-red border-red/30',
  TRIM:           'bg-amber/10 text-amber border-amber/20',
  // Results Desk brief-status
  PREPPED:        'bg-green/10 text-green border-green/20',
  NEEDS_BRIEF:    'bg-amber/10 text-amber border-amber/20',
  VERDICT_DUE:    'bg-red/15 text-red border-red/30 animate-pulse',
}

function resolveVariant(label, variant) {
  if (variant && VARIANT_MAP[variant]) return variant
  // Auto-detect from label
  const up = (label || '').toUpperCase()
  if (up.startsWith('TODAY'))      return 'TODAY'
  if (up.startsWith('TOMORROW') || up.includes('TOMORROW')) return 'TOMORROW'
  if (up.startsWith('THIS_WEEK') || up.includes('THIS WEEK')) return 'THIS_WEEK'
  if (up.startsWith('THIS_MONTH')) return 'THIS_MONTH'
  if (up === 'CRITICAL')           return 'CRITICAL'
  if (up === 'HIGH')               return 'HIGH'
  if (up === 'MED' || up === 'MEDIUM') return 'MED'
  if (up === 'LOW')                return 'LOW'
  if (up === 'TRIGGERED' || up === 'ON_TRACK') return 'TRIGGERED'
  if (up === 'NOT_TRIGGERED')      return 'NOT_TRIGGERED'
  if (up === 'PARTIAL' || up === 'WATCH') return 'PARTIAL'
  if (up === 'PENDING')            return 'PENDING'
  if (up === 'BUILDING')           return 'BUILDING'
  if (up === 'NEAR_COMPLETE')      return 'NEAR_COMPLETE'
  if (up === 'HOLD')               return 'HOLD'
  if (up === 'CRITICAL_UNDERFUND') return 'CRITICAL_UNDERFUND'
  if (up === 'BUY NOW')            return 'BUY NOW'
  if (up === 'BUY')                return 'BUY'
  if (up === 'BUILD')              return 'BUILD'
  if (up === 'HEDGE')              return 'HEDGE'
  if (up === 'EXIT')               return 'EXIT'
  if (up === 'TRIM')               return 'TRIM'
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[StatusBadge] Unknown variant for label="${label}" variant="${variant}" — falling back to LOW`)
  }
  return 'LOW'
}

export default function StatusBadge({ label, variant, size = 'sm', className = '' }) {
  const resolved = resolveVariant(label, variant)
  const colors   = VARIANT_MAP[resolved] || VARIANT_MAP.LOW

  const sizeClass = size === 'md'
    ? 'text-nano px-2.5 py-1 font-black'
    : 'text-micro px-1.5 py-0.5 font-black'

  return (
    <span
      className={`inline-flex items-center rounded border uppercase tracking-wider leading-none whitespace-nowrap ${sizeClass} ${colors} ${className}`}
    >
      {label}
    </span>
  )
}
