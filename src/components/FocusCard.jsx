import { useMemo } from 'react'
import { Focus } from 'lucide-react'
import fundamentalsData from '../data/fundamentals.json'
import insightsData from '../data/insights.json'
import aiInsightsData from '../data/ai-insights.json'
import { alphaModel } from '../lib/alphaModel'
import { computeFocus } from '../lib/focusEngine'
import { fL } from '../lib/format'

/**
 * FocusCard — the concentration nudge. At this book size, alpha lives in a
 * focused book where capital follows conviction × alpha. Cull the sub-scale
 * junk tail; feed the proven, under-sized winners.
 */
export default function FocusCard({ holdings = [], onSelect }) {
  const focus = useMemo(() => {
    const alphaMap = {}
    for (const h of holdings) {
      alphaMap[h.sym] = alphaModel({
        fundamentals: fundamentalsData?.stocks?.[h.sym],
        technicals: insightsData?.positions?.[h.sym]?.computedTechnicals,
        ltp: h.ltp, theme: h.theme,
        auditSeverity: aiInsightsData?.earningsAudit?.stocks?.[h.sym]?.severity,
        sectorRotation: aiInsightsData?.sectorRotation,
      })
    }
    return computeFocus(holdings, alphaMap)
  }, [holdings])

  if (!focus || focus.count === 0) return null
  const overDiversified = focus.effectiveN > focus.targetBand[1]
  const misaligned = focus.alignment != null && focus.alignment < 0.2

  return (
    <section className="rounded-xl border border-white/10 bg-white/2 p-4 space-y-3 transition-colors hover:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Focus className="w-4 h-4 text-amber" />
          <div>
            <div className="text-meta uppercase tracking-wider text-zinc-400 font-black">Focus</div>
            <div className="text-nano text-zinc-600">concentration · does capital follow alpha?</div>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-caption">
          <div className="text-right">
            <div className="text-nano text-zinc-600 uppercase">Positions</div>
            <div className="font-black text-zinc-200">{focus.count}</div>
          </div>
          <div className="text-right">
            <div className="text-nano text-zinc-600 uppercase">Effective</div>
            <div className={`font-black ${overDiversified ? 'text-amber' : 'text-green'}`}>{focus.effectiveN.toFixed(0)}</div>
          </div>
          <div className="text-right">
            <div className="text-nano text-zinc-600 uppercase">Target</div>
            <div className="font-black text-zinc-400">{focus.targetBand[0]}–{focus.targetBand[1]}</div>
          </div>
          {focus.alignment != null && (
            <div className="text-right" title="Correlation between position weight and alpha-model score — does your capital sit where the model sees alpha?">
              <div className="text-nano text-zinc-600 uppercase">Wt↔α align</div>
              <div className={`font-black ${misaligned ? 'text-red' : 'text-green'}`}>{focus.alignment.toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>

      <p className="text-caption text-zinc-400 leading-snug">
        {overDiversified
          ? <>At this size, a focused book compounds harder. {misaligned && <>Worse — weight barely tracks alpha ({focus.alignment.toFixed(2)}): your best names are under-sized while the tail holds capital. </>}The path: cull the weak tail, feed the proven 8s.</>
          : <>Book shape is in the focused band — keep capital following the winners.</>}
      </p>

      {focus.cull.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
          <span className="text-nano uppercase tracking-wider text-red font-black" title="Sub-scale + weak conviction or gated model score. Exiting frees capital without hurting alpha.">Cull · frees {fL(focus.cullValue)}</span>
          {focus.cull.map(r => (
            <button key={r.sym} onClick={() => onSelect?.(r.sym)} className="text-micro font-mono px-2 py-0.5 rounded border border-red/15 bg-red/5 text-zinc-300 hover:bg-red/10 transition-colors cursor-pointer">
              {r.sym} <span className="text-zinc-500">{r.pct.toFixed(1)}%</span> <span className="text-red">α{r.alpha ?? '—'}</span>
            </button>
          ))}
        </div>
      )}

      {focus.feed.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
          <span className="text-nano uppercase tracking-wider text-green font-black" title="Conviction ≥8, model agrees, yet under 3.5% of book — proven winners deserving more capital.">Feed — winners running small</span>
          {focus.feed.map(r => (
            <button key={r.sym} onClick={() => onSelect?.(r.sym)} className="text-micro font-mono px-2 py-0.5 rounded border border-green/15 bg-green/5 text-zinc-300 hover:bg-green/10 transition-colors cursor-pointer">
              {r.sym} <span className="text-zinc-500">{r.pct.toFixed(1)}%</span> <span className="text-green">α{r.alpha}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
