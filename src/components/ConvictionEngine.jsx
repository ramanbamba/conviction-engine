import { useMemo } from 'react'
import { fL } from '../lib/format'
import SectionHeader from './SectionHeader'

/**
 * ConvictionEngine — the command center atop the rebalance ladder.
 *
 * Synthesises the ladder into the three decisions that actually drive alpha
 * for a concentrate-winners / cut-losers / keep-hedge operator:
 *   1. Concentration — % of capital in conviction-8+ names (anti-diversification)
 *   2. Capital rotation — ₹ freeable from churn+trim → ₹ of high-conviction gaps
 *   3. Hedge status — Hedge bucket vs ₹6L target
 *
 * Props: holdings (enriched), ladder (from useRebalance)
 */

const CONC_TARGET = 70        // % of capital in conv-8+ we want to reach
const HEDGE_TARGET = 600000   // ₹6L gold+silver

export default function ConvictionEngine({ holdings = [], ladder }) {
  const s = useMemo(() => {
    const totalValue = holdings.reduce((a, h) => a + (h.value || 0), 0)

    // Concentration: capital sitting in conviction-8+ names
    const hiConv = holdings.filter(h => (h.conv || 0) >= 8)
    const hiConvValue = hiConv.reduce((a, h) => a + (h.value || 0), 0)
    const concentrationPct = totalValue ? (hiConvValue / totalValue) * 100 : 0

    // Capital rotation
    const churnValue   = ladder.churn.reduce((a, r) => a + r.value, 0)
    const trimProceeds = ladder.trim.reduce((a, r) => a + Math.max(0, r.value - r.tgtVal), 0)
    const freeable     = churnValue + trimProceeds
    const deployable   = ladder.doubleDown.reduce((a, r) => a + Math.max(0, r.tgtVal - r.value), 0)

    // Hedge
    const hedgeValue = holdings.filter(h => h.bucket === 'Hedge').reduce((a, h) => a + (h.value || 0), 0)
    const hedgePct   = (hedgeValue / HEDGE_TARGET) * 100

    return {
      concentrationPct,
      hiConvCount: hiConv.length,
      churnCount: ladder.churn.length,
      churnValue,
      trimProceeds,
      freeable,
      deployable,
      ddCount: ladder.doubleDown.length,
      hedgeValue,
      hedgePct,
    }
  }, [holdings, ladder])

  // Headline verdict
  const concGap = CONC_TARGET - s.concentrationPct
  const verdict = s.churnCount > 0
    ? `Cut ${s.churnCount} weak ${s.churnCount === 1 ? 'thesis' : 'theses'} → free ${fL(s.freeable)} → fund ${fL(s.deployable)} of high-conviction gaps.`
    : `No churn flagged. ${s.deployable > 0 ? `Deploy ${fL(s.deployable)} into ${s.ddCount} double-down names.` : 'Book at target weight.'}`

  const concColor =
    s.concentrationPct >= 70 ? 'text-green' :
    s.concentrationPct >= 55 ? 'text-amber' : 'text-red'
  const concBar =
    s.concentrationPct >= 70 ? 'bg-green' :
    s.concentrationPct >= 55 ? 'bg-amber' : 'bg-red'

  const hedgeColor =
    s.hedgePct >= 80 ? 'text-green' :
    s.hedgePct >= 40 ? 'text-amber' : 'text-red'
  const hedgeBar =
    s.hedgePct >= 80 ? 'bg-green' :
    s.hedgePct >= 40 ? 'bg-amber' : 'bg-red'

  return (
    <section className="card p-4 space-y-4">
      <SectionHeader title="Conviction Engine" subtitle={verdict} />

      {/* Concentration meter */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between font-mono">
          <span className="text-meta text-zinc-500 uppercase tracking-wider">Concentration · conviction 8+</span>
          <span className={`text-body font-black ${concColor}`}>
            {s.concentrationPct.toFixed(0)}%
            <span className="text-micro text-zinc-600 ml-1.5">{s.hiConvCount} names</span>
          </span>
        </div>
        <div className="relative w-full bg-white/5 h-[6px] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${concBar}`} style={{ width: `${Math.min(100, s.concentrationPct)}%` }} />
          {/* target marker */}
          <div className="absolute top-0 bottom-0 w-[2px] bg-white/40" style={{ left: `${CONC_TARGET}%` }} />
        </div>
        <div className="text-micro text-zinc-600 font-mono">
          {concGap > 2
            ? `${concGap.toFixed(0)}pp below ${CONC_TARGET}% target — cutting churn raises this.`
            : `At/above ${CONC_TARGET}% target. Book is concentrated where conviction is highest.`}
        </div>
      </div>

      {/* Capital rotation */}
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/5">
        <div className="font-mono">
          <div className="text-meta text-zinc-500 uppercase tracking-wider">Freeable</div>
          <div className="text-heading font-black text-red leading-none mt-0.5">{fL(s.freeable)}</div>
          <div className="text-micro text-zinc-600 mt-0.5">
            {fL(s.churnValue)} churn{s.trimProceeds > 0 ? ` + ${fL(s.trimProceeds)} trim` : ''}
          </div>
        </div>
        <div className="font-mono">
          <div className="text-meta text-zinc-500 uppercase tracking-wider">Deploy into</div>
          <div className="text-heading font-black text-green leading-none mt-0.5">{fL(s.deployable)}</div>
          <div className="text-micro text-zinc-600 mt-0.5">{s.ddCount} double-down gaps</div>
        </div>
      </div>

      {/* Hedge status */}
      <div className="space-y-1.5 pt-1 border-t border-white/5">
        <div className="flex items-baseline justify-between font-mono">
          <span className="text-meta text-zinc-500 uppercase tracking-wider">Hedge · gold + silver</span>
          <span className={`text-caption font-black ${hedgeColor}`}>
            {fL(s.hedgeValue)} <span className="text-zinc-600">/ {fL(HEDGE_TARGET)}</span>
          </span>
        </div>
        <div className="w-full bg-white/5 h-[6px] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${hedgeBar}`} style={{ width: `${Math.min(100, s.hedgePct)}%` }} />
        </div>
        {s.hedgePct < 80 && (
          <div className="text-micro text-zinc-600 font-mono">
            {(100 - s.hedgePct).toFixed(0)}% short — keep the downside buffer building as you concentrate.
          </div>
        )}
      </div>
    </section>
  )
}
