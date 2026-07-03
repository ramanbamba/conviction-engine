import { useMemo } from 'react'
import { IDEAL_PORTFOLIO, IDEAL_ORDER } from '../config/idealPortfolio'
import { fL } from '../lib/format'
import SectionHeader from './SectionHeader'

/**
 * IdealPortfolio — the directional allocation compass.
 *
 * Current allocation shape vs the ideal (50% Platinum / 50% rest), per bucket,
 * with the drift and a plain-language read on where new money leans. Not a hard
 * target — a compass for "when you deploy, tilt here."
 */

export default function IdealPortfolio({ holdings = [] }) {
  const rows = useMemo(() => {
    const cur = {}
    let total = 0
    for (const h of holdings) {
      const v = (h.qty || 0) * (h.ltp || 0)
      cur[h.bucket] = (cur[h.bucket] || 0) + v
      total += v
    }
    return IDEAL_ORDER.map(name => {
      const idealPct = (IDEAL_PORTFOLIO.buckets[name]?.pct || 0) * 100
      const curPct = total ? (cur[name] || 0) / total * 100 : 0
      return { name, label: IDEAL_PORTFOLIO.buckets[name]?.label || name, curPct, idealPct, drift: curPct - idealPct, curVal: cur[name] || 0 }
    })
  }, [holdings])

  // Where new money leans = most underweight buckets
  const leans = rows.filter(r => r.drift < -1.5).sort((a, b) => a.drift - b.drift).slice(0, 3)
  const heavy = rows.filter(r => r.drift > 2).sort((a, b) => b.drift - a.drift)

  const driftLabel = (d) => {
    if (Math.abs(d) <= 1.5) return { text: 'on target', cls: 'text-green' }
    if (d < 0) return { text: `${Math.abs(d).toFixed(0)}pp under`, cls: 'text-amber' }
    return { text: `${d.toFixed(0)}pp over`, cls: 'text-zinc-500' }
  }

  return (
    <section className="card p-4 space-y-4">
      <SectionHeader
        title="Ideal Portfolio · the reference corpus compass"
        subtitle="Directional, not a hard target — 50% Platinum model / 50% growth & hedge. Where new money leans whenever it arrives."
      />

      {/* Per-bucket: current bar with ideal marker */}
      <div className="space-y-2.5">
        {rows.map(r => {
          const d = driftLabel(r.drift)
          const barMax = Math.max(...rows.map(x => Math.max(x.curPct, x.idealPct)), 1)
          return (
            <div key={r.name} className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-caption font-mono text-zinc-400 truncate">{r.name}</div>
              <div className="flex-1 relative h-4 flex items-center">
                <div className="absolute inset-0 bg-white/5 rounded" />
                <div className="absolute h-4 rounded bg-white/25" style={{ width: `${r.curPct / barMax * 100}%` }} />
                {/* ideal marker */}
                <div className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-green" style={{ left: `${r.idealPct / barMax * 100}%` }} title={`ideal ${r.idealPct}%`} />
              </div>
              <div className="w-14 shrink-0 text-right font-mono text-caption text-white">{r.curPct.toFixed(0)}%</div>
              <div className={`w-20 shrink-0 text-right font-mono text-nano ${d.cls}`}>{d.text}</div>
            </div>
          )
        })}
      </div>
      <p className="text-nano text-zinc-600 font-mono">bar = current · green tick = ideal %</p>

      {/* Directional read */}
      <div className="rounded-lg border border-white/5 bg-white/2 p-3 text-caption text-zinc-300 leading-relaxed">
        {leans.length > 0 ? (
          <>
            <span className="text-white font-bold">New money leans → </span>
            {leans.map((r, i) => (
              <span key={r.name}>
                {i > 0 && ', '}
                <span className="text-amber font-mono">{r.name}</span> <span className="text-zinc-500">({Math.abs(r.drift).toFixed(0)}pp under)</span>
              </span>
            ))}
            {'. '}
          </>
        ) : (
          <span className="text-green font-bold">Allocation is on shape. </span>
        )}
        {heavy.length > 0 && (
          <span className="text-zinc-400">
            {heavy.map(r => r.name).join(', ')} {heavy.length > 1 ? 'are' : 'is'} overweight — fund the laggards from churn before adding here.
          </span>
        )}
      </div>
    </section>
  )
}
