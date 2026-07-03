/**
 * guardrails.js — rearview lessons fired forward as live interventions.
 *
 * Matches the CURRENT book against the behavioral patterns the tradebook proved
 * cost money, so the product intercepts a repeat before it happens. All thresholds
 * and rupee figures are derived from rearview.json — they stay true as the
 * tradebook grows.
 *
 * computeGuardrails(holdings, rearview) → [{ severity, type, sym, title, message }]
 *   severity: 'red' (cut/act) | 'amber' (watch) | 'green' (reinforce)
 */

const EXCLUDED = new Set(['Hedge', 'Cash', 'Satellites'])
const L = n => `₹${(Math.abs(n) / 1e5).toFixed(2)}L`

export function computeGuardrails(holdings = [], rearview = {}) {
  if (!rearview?.span) return []

  // Pull the proven costs/patterns from the rearview, not hardcoded
  const buckets = rearview.holdingPeriods?.buckets || []
  const longPnl = buckets.find(b => b.label === '> 1 year')?.pnl ?? 0
  const tradeWindowPnl = buckets
    .filter(b => ['1–3 mo', '3–12 mo'].includes(b.label))
    .reduce((a, b) => a + b.pnl, 0)
  const fatTails = (rearview.biggestLosses || []).slice(0, 2).map(l => l.symbol)
  const roundTrips = new Map((rearview.roundTrippers || []).map(r => [r.symbol, r.entries]))

  const holdLesson = longPnl > 0 && tradeWindowPnl < 0
    ? `your >1yr holds made ${L(longPnl)} while 1–12mo trades lost ${L(tradeWindowPnl)}`
    : 'long holds are where your money is made'
  const cutLesson = fatTails.length
    ? `${fatTails.join(' & ')} cost you ${L(rearview.biggestLosses.slice(0,2).reduce((a,l)=>a+l.pnl,0))} by holding broken theses`
    : 'fat-tail losers erased years of gains'

  const out = []

  for (const h of holdings) {
    if (EXCLUDED.has(h.bucket)) continue
    const conv = Number(h.conv ?? 0)
    const pnlPct = Number(h.pnlPct ?? 0)
    const rt = roundTrips.get(h.sym)

    // 1. CUT — broken thesis bleeding (the NCC/DLF pattern)
    if (pnlPct < -0.20 && conv <= 5) {
      out.push({
        severity: 'red', type: 'cut_broken', sym: h.sym,
        title: `Cut or commit: ${h.sym}`,
        message: `${h.sym} is ${(pnlPct * 100).toFixed(0)}% with conviction ${conv}. ${cap(cutLesson)}. Don't drift — cut it or re-commit with a thesis.`,
      })
      continue
    }

    // 2. ROUND-TRIP — re-buying your own winner higher
    if (rt && conv >= 7) {
      out.push({
        severity: 'amber', type: 'round_trip', sym: h.sym,
        title: `Stop trading ${h.sym}`,
        message: `You've round-tripped ${h.sym} ${rt}× — re-entering your own winner higher each time. It's a conviction-${conv} hold now. Hold it, don't trade around it.`,
      })
      continue
    }

    // 3. HOLD — reinforce letting a high-conviction winner run
    if (conv >= 8 && pnlPct > 0.15) {
      out.push({
        severity: 'green', type: 'hold_winner', sym: h.sym,
        title: `Let ${h.sym} run`,
        message: `${h.sym} +${(pnlPct * 100).toFixed(0)}% on conviction ${conv}. Remember — ${holdLesson}. Don't book it early.`,
      })
    }
  }

  // Priority: red → amber → green; cap reinforcements so the card stays actionable
  const order = { red: 0, amber: 1, green: 2 }
  out.sort((a, b) => order[a.severity] - order[b.severity])
  const greens = out.filter(g => g.severity === 'green').slice(0, 2)
  const rest = out.filter(g => g.severity !== 'green')
  return [...rest, ...greens]
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

/**
 * stockGuardrail(sym, holdings, rearview) — the per-stock interception for the
 * dossier. Returns the live guardrail (if any) plus this name's full tradebook
 * record, so you see your own history with it at the moment you're about to act.
 * Returns null when there's nothing to say.
 */
export function stockGuardrail(sym, holdings = [], rearview = {}) {
  if (!sym || !rearview?.span) return null
  const holding = holdings.find(h => h.sym === sym)
  const live = computeGuardrails(holding ? [holding] : [], rearview)[0] || null
  const history = (rearview.stockLedger || []).find(s => s.symbol === sym) || null
  if (!live && !history) return null
  return { live, history }
}
