import { useMemo } from 'react'
import SectionHeader from './SectionHeader'

const ACTIVE_BUCKETS = ['Platinum', 'Stars', 'Power Alpha', 'Compounders']

// canonical conviction scale (see lib/format.convClass)
function avgConvColor(v) {
  if (v >= 8) return 'text-green'
  if (v >= 6) return 'text-zinc-300'
  if (v >= 4) return 'text-amber'
  return 'text-red'
}

function borderCls(v) {
  if (v >= 7.5) return 'border-green/20'
  if (v >= 6)   return 'border-amber/20'
  return 'border-red/20'
}

function zeroColor(v) {
  if (v >= 6) return 'text-amber'
  if (v >= 4) return 'text-red'
  return 'text-red font-black'
}

export default function BucketDrift({ rows }) {
  const stats = useMemo(() => {
    return ACTIVE_BUCKETS.map(bucket => {
      const positions = rows.filter(r => r.bucket === bucket)
      if (!positions.length) return null

      const avgConv = positions.reduce((s, r) => s + r.conviction, 0) / positions.length

      // Action distribution
      const dist = { DOUBLE_DOWN: 0, HOLD: 0, TRIM: 0, CHURN: 0 }
      for (const r of positions) dist[r.action] = (dist[r.action] || 0) + 1

      // Heroes: top 2 by conviction
      const heroes = [...positions]
        .sort((a, b) => b.conviction - a.conviction)
        .slice(0, 2)

      // Zeroes: low conviction dragging the bucket
      const zeroes = [...positions]
        .filter(r => r.conviction < 7)
        .sort((a, b) => a.conviction - b.conviction)
        .slice(0, 3)

      return { bucket, count: positions.length, avgConv, dist, heroes, zeroes }
    }).filter(Boolean)
  }, [rows])

  if (!stats.length) return null

  return (
    <section className="space-y-3">
      <SectionHeader title="Bucket Health" subtitle="Heroes & zeroes by conviction. Action pulse shows how positions are classified." />
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ bucket, count, avgConv, dist, heroes, zeroes }) => (
          <div key={bucket} className={`rounded-xl border ${borderCls(avgConv)} bg-white/3 p-3 space-y-2.5`}>

            {/* Conviction headline */}
            <div className="flex items-start justify-between gap-1">
              <div>
                <div className="text-meta font-black text-white uppercase tracking-wider leading-none">{bucket}</div>
                <div className="text-micro text-zinc-600 font-mono mt-0.5">{count} positions</div>
              </div>
              <div className={`font-mono text-heading font-black leading-none shrink-0 ${avgConvColor(avgConv)}`}>
                {avgConv.toFixed(1)}
              </div>
            </div>

            {/* Action pulse */}
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-micro pt-1 border-t border-white/5">
              {dist.DOUBLE_DOWN > 0 && (
                <span className="text-green font-bold">{dist.DOUBLE_DOWN} DD</span>
              )}
              {dist.HOLD > 0 && (
                <span className="text-zinc-500">{dist.HOLD} Hold</span>
              )}
              {dist.TRIM > 0 && (
                <span className="text-amber font-bold">{dist.TRIM} Trim</span>
              )}
              {dist.CHURN > 0 && (
                <span className="text-red font-bold">{dist.CHURN} Churn</span>
              )}
            </div>

            {/* Heroes */}
            {heroes.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-white/5">
                <div className="text-micro text-zinc-600 uppercase tracking-wider">Heroes</div>
                {heroes.map(h => (
                  <div key={h.sym} className="flex items-center justify-between gap-2">
                    <span className="text-micro font-mono text-zinc-300 truncate">{h.sym}</span>
                    <span className="text-micro font-mono font-bold text-green shrink-0">{h.conviction.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Zeroes */}
            {zeroes.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-white/5">
                <div className="text-micro text-zinc-600 uppercase tracking-wider">Zeroes</div>
                {zeroes.map(z => (
                  <div key={z.sym} className="flex items-center justify-between gap-2">
                    <span className="text-micro font-mono text-zinc-400 truncate">{z.sym}</span>
                    <span className={`text-micro font-mono shrink-0 ${zeroColor(z.conviction)}`}>
                      {z.conviction.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}

          </div>
        ))}
      </div>
    </section>
  )
}
