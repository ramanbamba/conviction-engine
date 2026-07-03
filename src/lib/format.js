export const fL  = (n) => `₹${Math.abs(n / 100000).toFixed(2)}L`
export const fP  = (n) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`
export const fN  = (n) => Number(n).toLocaleString('en-IN')
export const fR  = (n) => `₹${fN(Math.round(n))}`

export const BUCKET_ORDER = ['Platinum', 'Stars', 'Power Alpha', 'Compounders', 'Satellites', 'Hedge', 'Cash']

export const BUCKET_COLORS = {
  Platinum:    '#3B82F6',
  Stars:       '#10B981',
  'Power Alpha': '#F59E0B',
  Compounders: '#8B5CF6',
  Satellites:  '#6B7280',
  Hedge:       '#EAB308',
  Cash:        '#22C55E',
}

// ── Conviction encoding — ONE canonical scale, used everywhere ──
// 8+ strong (green) · 6–7.9 solid (zinc) · 4–5.9 borderline (amber) · <4 weak (red)
export const convColor = (s) => {
  if (!s) return '#71717a' // zinc-500
  return s >= 8 ? '#10B981' : s >= 6 ? '#a1a1aa' : s >= 4 ? '#F59E0B' : '#EF4444'
}
export const convClass = (s) => {
  if (!s) return 'text-zinc-500'
  return s >= 8 ? 'text-green' : s >= 6 ? 'text-zinc-300' : s >= 4 ? 'text-amber' : 'text-red'
}
