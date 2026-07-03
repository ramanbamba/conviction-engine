import React, { useMemo, useState } from 'react'
import { Target, Info } from 'lucide-react'
import { fL } from '../lib/format'
import { computeModelAlignment } from '../lib/modelAlignment'
import { positionVerdict } from '../lib/positionVerdict'
import fundamentalsData from '../data/fundamentals.json'
import aiInsightsData from '../data/ai-insights.json'

// Model vintage label — dynamic from the last logged Advisor update (no hardcoded dates).
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
function modelVintage() {
  const d = aiInsightsData?.advisorModelUpdate?.asOf
  if (!d) return 'current'
  const [y, m] = d.split('-').map(Number)
  return m ? `${MONTHS[m - 1]} ${y}` : 'current'
}

const VERDICT_TONE = {
  g: 'text-green border-green/30 bg-green/10',
  n: 'text-zinc-300 border-white/15 bg-white/5',
  b: 'text-red border-red/30 bg-red/10',
}

/**
 * ModelAlignment — advisor model gap, at a glance.
 * Shows each Platinum holding's model vs actual weight, a centered drift bar,
 * and the ₹ to deploy to align. Sorted most-underweight first (the buy queue).
 * Each row's (i) reconciles the model signal vs our conviction/fundamentals into
 * a final call — the guard against blindly filling a junk gap.
 */
export default function ModelAlignment({ holdings, bucketTargets, onSelect }) {
  const a = useMemo(() => computeModelAlignment(holdings, bucketTargets, fundamentalsData), [holdings, bucketTargets])
  const hMap = useMemo(() => Object.fromEntries(holdings.map(h => [h.sym, h])), [holdings])
  const [openInfo, setOpenInfo] = useState(null)
  if (!a) return null

  const deployPct = a.target > 0 ? Math.min((a.curTotal / a.target) * 100, 100) : 0

  return (
    <section className="rounded-xl border border-white/10 bg-white/2 p-4 space-y-3">
      {/* header + headline numbers */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-green" />
          <div>
            <div className="text-meta uppercase tracking-wider text-zinc-400 font-black">Advisor Model Alignment</div>
            <div className="text-nano text-zinc-600">Platinum · {modelVintage()} model weights · benchmark, not a mandate</div>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-caption">
          <div className="text-right"><div className="text-nano text-zinc-600 uppercase">Current</div><div className="text-zinc-200 font-bold">{fL(a.curTotal)}</div></div>
          <div className="text-right"><div className="text-nano text-zinc-600 uppercase">Target</div><div className="text-zinc-200 font-bold">{fL(a.target)}</div></div>
          <div className="text-right"><div className="text-nano text-zinc-600 uppercase">To deploy</div><div className="text-amber font-bold">{a.buildGap >= 0 ? '+' : '−'}{fL(a.buildGap)}</div></div>
        </div>
      </div>

      {/* bucket fill bar */}
      <div className="h-[5px] bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-green/70 rounded-full" style={{ width: `${deployPct}%` }} />
      </div>

      {/* per-stock rows */}
      <div className="space-y-0.5">
        {/* column header */}
        <div className="flex items-center gap-2 px-1 pb-1 text-nano uppercase tracking-wider text-zinc-600 font-black">
          <span className="w-16">Stock</span>
          <span className="w-24 text-right">Model→Actual</span>
          <span className="flex-1 text-center">Drift (over ◂ ▸ under)</span>
          <span className="w-20 text-right">Rebal ₹</span>
          <span className="w-5 text-center">Call</span>
        </div>
        {a.rows.map(r => {
          const under = r.driftPp < 0                 // below model weight → add
          const mag = Math.min(Math.abs(r.driftPp) / a.maxDrift, 1) * 50  // half-width %
          // unified next-move call (catches stop-breaches the raw model gap misses)
          const v = positionVerdict(hMap[r.sym], fundamentalsData?.stocks?.[r.sym], { modelVerdict: r.verdict }) || r.verdict
          const isOpen = openInfo === r.sym
          const dot = v.tone === 'g' ? 'text-green' : v.tone === 'b' ? 'text-red' : 'text-zinc-500'
          return (
            <div key={r.sym} className={`rounded transition-colors ${isOpen ? 'bg-white/4' : 'hover:bg-white/3'}`}>
              <div className="flex items-center gap-2 px-1 py-1.5">
                <button onClick={() => onSelect?.(r.sym)} className="flex-1 flex items-center gap-2 text-left cursor-pointer min-w-0">
                  <span className="w-16 font-mono font-black text-white text-caption truncate">{r.sym}</span>
                  <span className="w-24 text-right font-mono text-micro text-zinc-500 tabular-nums">
                    {(r.modelWt * 100).toFixed(1)}<span className="text-zinc-700">→</span><span className="text-zinc-300">{(r.actWt * 100).toFixed(1)}%</span>
                  </span>
                  {/* centered drift bar */}
                  <span className="flex-1 relative h-[14px] flex items-center">
                    <span className="absolute left-1/2 top-0 bottom-0 w-px bg-white/15" />
                    <span
                      className={`absolute h-[7px] rounded-sm ${under ? 'bg-amber/80' : 'bg-zinc-500/70'}`}
                      style={under ? { left: '50%', width: `${mag}%` } : { right: '50%', width: `${mag}%` }}
                    />
                  </span>
                  <span className={`w-20 text-right font-mono text-micro font-bold tabular-nums ${r.gapRebal > 5000 ? 'text-amber' : r.gapRebal < -5000 ? 'text-zinc-500' : 'text-zinc-600'}`}>
                    {r.gapRebal >= 0 ? '+' : '−'}{fL(r.gapRebal)}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenInfo(isOpen ? null : r.sym) }}
                  title="Final recommendation"
                  className={`w-5 h-5 shrink-0 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isOpen ? dot : 'text-zinc-600'}`}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
              {isOpen && (
                <div className="px-2 pb-2 pt-0.5 ml-1 flex items-start gap-2">
                  <span className={`shrink-0 text-nano font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${VERDICT_TONE[v.tone]}`}>{v.call}</span>
                  <p className="text-micro text-zinc-400 leading-snug">{v.reason}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-nano text-zinc-600 leading-snug pt-1 border-t border-white/5">
        <span className="text-amber">Amber</span> = underweight vs Advisor · grey = overweight. But we run the <span className="text-zinc-400">alpha overlay</span> — overweight the high-conviction names, starve the weak — so the <span className="text-zinc-400">Call (i)</span> governs, not the raw gap. Add only where the Call is <span className="text-green">green</span>; the <span className="text-red">red</span>-Call amber names are <span className="italic">intentionally</span> underweight, not a gap to fill.
      </p>
    </section>
  )
}
