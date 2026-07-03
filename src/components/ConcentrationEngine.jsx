import { useMemo } from 'react'
import { Crosshair } from 'lucide-react'
import fundamentalsData from '../data/fundamentals.json'
import insightsData from '../data/insights.json'
import aiInsightsData from '../data/ai-insights.json'
import { alphaModel } from '../lib/alphaModel'
import { computeTargetBook } from '../lib/concentrationEngine'
import { fL } from '../lib/format'

const pctStr = v => `${v.toFixed(1)}%`

function WeightBar({ cur, tgt }) {
  const max = Math.max(cur, tgt, 1)
  return (
    <div className="relative h-2 w-full rounded bg-white/5 overflow-hidden">
      {/* target ghost */}
      <div className="absolute inset-y-0 left-0 rounded bg-green/25" style={{ width: `${tgt / max * 100}%` }} />
      {/* current solid */}
      <div className="absolute inset-y-0 left-0 rounded bg-green/70" style={{ width: `${cur / max * 100}%` }} />
    </div>
  )
}

/**
 * ConcentrationEngine — the target book. Model-driven target weight per name
 * (conviction × AlphaScore, gated, convex, capped); the exact reallocation that
 * moves capital from the low-edge tail into the proven, under-sized winners.
 * The biggest alpha lever (PHASE_19 Sprint B).
 */
export default function ConcentrationEngine({ holdings = [], onSelect }) {
  const t = useMemo(() => {
    const aMap = {}
    for (const h of holdings) {
      aMap[h.sym] = alphaModel({
        fundamentals: fundamentalsData?.stocks?.[h.sym],
        technicals: insightsData?.positions?.[h.sym]?.computedTechnicals,
        ltp: h.ltp, theme: h.theme,
        auditSeverity: aiInsightsData?.earningsAudit?.stocks?.[h.sym]?.severity,
        sectorRotation: aiInsightsData?.sectorRotation,
      })
    }
    return computeTargetBook(holdings, aMap)
  }, [holdings])

  if (!t || t.coreCount === 0) return null
  const cutValue = t.cut.reduce((a, r) => a + r.curVal, 0)
  const Chip = ({ r, tone }) => (
    <button onClick={() => onSelect?.(r.sym)}
      className={`text-micro font-mono px-2 py-0.5 rounded border transition-colors cursor-pointer ${tone}`}>
      {r.sym} {r.alpha != null && <span className="opacity-70">α{r.alpha}</span>} {r.conv != null && <span className="opacity-60">c{r.conv}</span>}
    </button>
  )

  return (
    <section className="rounded-xl border border-white/10 bg-white/2 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-green" />
          <div>
            <div className="text-meta uppercase tracking-wider text-zinc-400 font-black">Concentration Engine</div>
            <div className="text-nano text-zinc-600">model-ideal target book · capital follows conviction × alpha</div>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-caption">
          <div className="text-right">
            <div className="text-nano text-zinc-600 uppercase">Effective N</div>
            <div className="font-black text-white">{t.effectiveNow.toFixed(1)} <span className="text-zinc-600">→</span> <span className="text-green">{t.effectiveTarget.toFixed(1)}</span></div>
          </div>
          <div className="text-right">
            <div className="text-nano text-zinc-600 uppercase">Core</div>
            <div className="font-black text-zinc-200">{t.coreCount}</div>
          </div>
        </div>
      </div>

      <p className="text-caption text-zinc-400 leading-snug">
        Cut the low-edge tail (<span className="text-red font-bold">{fL(cutValue)}</span>), let the winners run within the 12% cap, and feed the under-sized proven names (<span className="text-green font-bold">{fL(t.fundNeeded)}</span> to target). Your tradebook: holding winners made ₹5.53L; the alpha is in fewer, bigger, higher-edge bets.
      </p>

      {/* FEED — under-sized winners to press */}
      {t.feed.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-nano uppercase tracking-wider text-green font-black">Feed — press the proven winners</div>
          {t.feed.map(r => (
            <button key={r.sym} onClick={() => onSelect?.(r.sym)}
              className="w-full flex items-center gap-3 py-1 hover:bg-white/2 rounded transition-colors cursor-pointer group">
              <span className="font-mono font-black text-white text-caption w-24 shrink-0 text-left">{r.sym}</span>
              <div className="flex-1"><WeightBar cur={r.curPct} tgt={r.tgtPct} /></div>
              <span className="font-mono text-micro text-zinc-500 w-24 text-right shrink-0">{pctStr(r.curPct)} → <span className="text-green">{pctStr(r.tgtPct)}</span></span>
              <span className="font-mono text-micro font-black text-green w-16 text-right shrink-0">+{fL(r.deltaVal)}</span>
            </button>
          ))}
        </div>
      )}

      {/* CUT — the tail to redeploy */}
      {t.cut.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
          <span className="text-nano uppercase tracking-wider text-red font-black" title="Conviction < 5 or landmine-gated. Target 0 — redeploy into the core.">Cut · frees {fL(cutValue)}</span>
          {t.cut.map(r => <Chip key={r.sym} r={r} tone="border-red/20 bg-red/5 text-zinc-300 hover:bg-red/10" />)}
        </div>
      )}

      {/* Path to deeper concentration */}
      {(t.override.length > 0 || t.review.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
          <span className="text-nano uppercase tracking-wider text-amber font-black" title="To compress further: OVERRIDE = model gates it, you hold for a catalyst (machine-vs-you). REVIEW = model lukewarm, conviction-held. These are the next pool if catalysts fail.">Deeper → decide</span>
          {t.override.map(r => <Chip key={r.sym} r={r} tone="border-amber/25 bg-amber/5 text-amber hover:bg-amber/10" />)}
          {t.review.map(r => <Chip key={r.sym} r={r} tone="border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10" />)}
        </div>
      )}

      <div className="text-micro font-mono text-zinc-600 pt-1 border-t border-white/5">
        Winners held within the 12% cap (WABAG, ICICI, BEL…) are never auto-trimmed — the tape says early-trimming winners cost ₹4.18L. Builds left to grow.
      </div>
    </section>
  )
}
