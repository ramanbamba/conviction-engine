// ─── Rotation Alpha ───────────────────────────────────────────────────────────
// "Am I positioned for THIS regime?" Maps every holding to (a) its sector's
// standing in the current rotation and (b) its own price momentum, then scores
// book-level alignment and surfaces FEED (lean in) / CULL (lean out) signals.
//
// Capital must follow conviction × momentum × regime. In an upswing the alpha is
// in owning the leaders with momentum and starving the laggards that are fading.
//
// THEME_REGIME is judgment-driven and refreshed each cycle (like a compass).
// Current regime — Jun 2026: capex / infra / defence / financials leading;
// IT, FMCG, and precious metals lagging; crude easing, FIIs returning.
// ────────────────────────────────────────────────────────────────────────────

export const ROTATION_AS_OF = '2026-06-28'

const THEME_REGIME = {
  // LEADERS — capex/infra/defence/financials/auto upswing
  'T&D': 'LEADER', 'T&D+DC': 'LEADER', 'Infra': 'LEADER', 'Water': 'LEADER',
  'Defence': 'LEADER', 'Construction': 'LEADER', 'Banking': 'LEADER', 'NBFC': 'LEADER',
  'Cables': 'LEADER', 'Renewable': 'LEADER', 'Auto': 'LEADER', 'Auto Ancil': 'LEADER',
  // LAGGARDS — fading into the rotation
  'IT': 'LAGGARD', 'FMCG': 'LAGGARD', 'Consumer': 'LAGGARD', 'Gold': 'LAGGARD', 'Silver': 'LAGGARD',
  // everything else resolves to NEUTRAL
}

// Buckets that are strategic insurance, not active rotation capital
const EXCLUDED_BUCKETS = new Set(['Hedge', 'Cash', 'Satellites'])

export const REGIME_OF = (theme) => THEME_REGIME[theme] || 'NEUTRAL'

export const REGIME_META = {
  LEADER:  { label: 'Leaders',  color: '#10B981', cls: 'text-green' },
  NEUTRAL: { label: 'Neutral',  color: '#a1a1aa', cls: 'text-zinc-400' },
  LAGGARD: { label: 'Laggards', color: '#EF4444', cls: 'text-red' },
}

// ── Momentum: pure read of the technical posture ──
// Inputs from insights.json computedTechnicals: vsSma50Pct, vsSma200Pct, rsi14, fromHighPct
export function momentumScore(t) {
  if (!t || t.rsi14 == null) return null
  let s = 0
  if (t.vsSma50Pct > 0)  s += 1
  if (t.vsSma50Pct > 8)  s += 0.5
  if (t.vsSma200Pct > 0) s += 1
  if (t.vsSma200Pct > 15) s += 0.5
  if (t.rsi14 >= 55 && t.rsi14 <= 80) s += 1
  else if (t.rsi14 < 35) s -= 1
  else if (t.rsi14 > 80) s += 0.5            // strong but watch for exhaustion
  if (t.fromHighPct > -10) s += 1            // near 52w high
  else if (t.fromHighPct < -40) s -= 1       // deep in a downtrend
  return s                                    // ~ -3 .. +5
}

export const MOMENTUM_META = {
  HOT:  { label: 'Hot',  color: '#10B981', cls: 'text-green' },
  WARM: { label: 'Warm', color: '#14B8A6', cls: 'text-teal' },
  COOL: { label: 'Cool', color: '#F59E0B', cls: 'text-amber' },
  COLD: { label: 'Cold', color: '#EF4444', cls: 'text-red' },
  NA:   { label: '—',    color: '#71717a', cls: 'text-zinc-500' },
}

export function momentumTier(t) {
  const s = momentumScore(t)
  if (s == null) return 'NA'
  if (s >= 3.5) return 'HOT'
  if (s >= 1.5) return 'WARM'
  if (s >= 0)   return 'COOL'
  return 'COLD'
}

// ── Per-holding rotation read + FEED/CULL signal ──
function signalFor({ regime, tier, conv, pnlPct, sl, ltp }) {
  const hotWarm = tier === 'HOT' || tier === 'WARM'
  const coolCold = tier === 'COOL' || tier === 'COLD'
  const belowStop = sl != null && ltp != null && ltp < sl
  // CULL: laggard sector, fading momentum, weak conviction (or stop broken)
  if ((regime === 'LAGGARD' && coolCold && (conv == null || conv < 6)) || (belowStop && (conv == null || conv < 6))) {
    return 'CULL'
  }
  // FEED: leader sector, momentum behind it, conviction earns more capital
  if (regime === 'LEADER' && hotWarm && conv != null && conv >= 7) return 'FEED'
  return 'HOLD'
}

export const SIGNAL_META = {
  FEED: { label: 'FEED', color: '#10B981', cls: 'text-green border-green/30 bg-green/10' },
  HOLD: { label: 'HOLD', color: '#a1a1aa', cls: 'text-zinc-400 border-white/10 bg-white/5' },
  CULL: { label: 'CULL', color: '#EF4444', cls: 'text-red border-red/30 bg-red/10' },
}

// ── Book-level computation ──
// holdings: enriched (value, pnlPct, conv, theme, bucket, sl, ltp, gap)
// insightsData: { positions: { [sym]: { computedTechnicals } } }
export function computeRotationAlpha(holdings = [], insightsData = null) {
  const rows = []
  let leaderVal = 0, neutralVal = 0, laggardVal = 0, activeVal = 0

  for (const h of holdings) {
    if (EXCLUDED_BUCKETS.has(h.bucket)) continue
    const tech = insightsData?.positions?.[h.sym]?.computedTechnicals
    const regime = REGIME_OF(h.theme)
    const tier = momentumTier(tech)
    const signal = signalFor({ regime, tier, conv: h.conv, pnlPct: h.pnlPct, sl: h.sl, ltp: h.ltp })
    const val = h.value || 0
    activeVal += val
    if (regime === 'LEADER') leaderVal += val
    else if (regime === 'LAGGARD') laggardVal += val
    else neutralVal += val

    rows.push({
      sym: h.sym, theme: h.theme, bucket: h.bucket, conv: h.conv,
      value: val, pnlPct: h.pnlPct, gap: h.gap,
      regime, tier, momentum: momentumScore(tech), signal,
      rsi: tech?.rsi14, vsSma50: tech?.vsSma50Pct, vsSma200: tech?.vsSma200Pct, fromHigh: tech?.fromHighPct,
    })
  }

  const pct = (v) => activeVal > 0 ? v / activeVal : 0
  const leaderPct = pct(leaderVal), neutralPct = pct(neutralVal), laggardPct = pct(laggardVal)
  // Alignment: net tilt toward leaders, 0..1 (0.5 = balanced)
  const alignment = 0.5 + (leaderPct - laggardPct) / 2

  const feed = rows.filter(r => r.signal === 'FEED').sort((a, b) => (b.gap || 0) - (a.gap || 0))
  const cull = rows.filter(r => r.signal === 'CULL').sort((a, b) => (a.momentum ?? 0) - (b.momentum ?? 0))

  return {
    asOf: ROTATION_AS_OF,
    rows: rows.sort((a, b) => b.value - a.value),
    activeVal, leaderVal, neutralVal, laggardVal,
    leaderPct, neutralPct, laggardPct, alignment,
    feed, cull,
  }
}
