import { useMemo, useState } from 'react'
import SectionHeader from './SectionHeader'
import { computeDeployment } from '../lib/deploymentEngine'
import { alphaModel } from '../lib/alphaModel'
import { fL } from '../lib/format'
import rearviewData from '../data/rearview.json'
import fundamentalsData from '../data/fundamentals.json'
import insightsData from '../data/insights.json'
import aiInsightsData from '../data/ai-insights.json'

/**
 * DeploymentOptimizer — "I have ₹X. Buy what, exactly?"
 * Ranked, rupee-specific allocation from compass + model gaps + Keeper + conviction.
 * New-money mode (enter amount) or Rotation mode (auto-source from churn).
 */
const PRESETS = [100000, 200000, 500000]

export default function DeploymentOptimizer({ holdings = [] }) {
  const [mode, setMode] = useState('new')
  const [amount, setAmount] = useState(200000)

  // The alpha model's view of every holding — equal vote with conviction, hard
  // gate on landmines (see ALPHA_MODEL.md)
  const alphaMap = useMemo(() => {
    const m = {}
    for (const h of holdings) {
      m[h.sym] = alphaModel({
        fundamentals: fundamentalsData?.stocks?.[h.sym],
        technicals: insightsData?.positions?.[h.sym]?.computedTechnicals,
        ltp: h.ltp, theme: h.theme,
        auditSeverity: aiInsightsData?.earningsAudit?.stocks?.[h.sym]?.severity,
        sectorRotation: aiInsightsData?.sectorRotation,
      })
    }
    return m
  }, [holdings])

  const result = useMemo(
    () => computeDeployment(holdings, { amount, mode, rearview: rearviewData, alphaMap }),
    [holdings, amount, mode, alphaMap]
  )

  return (
    <section className="card p-4 space-y-4">
      <SectionHeader
        title="Deployment Optimizer"
        subtitle="Where the next rupee goes — ranked by the alpha model + conviction, model gap, and the ideal compass."
      />

      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-white/10 overflow-hidden text-meta font-mono">
        {[['new', 'New money'], ['rotation', 'Rotate churn']].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-3 py-1 uppercase tracking-wider cursor-pointer transition-colors ${mode === m ? 'bg-white/10 text-white font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
          >{label}</button>
        ))}
      </div>

      {/* Amount control */}
      {mode === 'new' ? (
        <div className="flex items-center gap-2 flex-wrap font-mono">
          <span className="text-caption text-zinc-500">Deploy</span>
          <span className="text-body font-black text-white">{fL(amount)}</span>
          <div className="flex gap-1.5 ml-1">
            {PRESETS.map(p => (
              <button key={p} onClick={() => setAmount(p)}
                className={`px-2 py-0.5 rounded text-meta border cursor-pointer transition-colors ${amount === p ? 'border-green/40 bg-green/10 text-green' : 'border-white/10 text-zinc-500 hover:text-zinc-300'}`}
              >{fL(p)}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-caption font-mono text-zinc-400">
          Sourcing <span className="text-red font-bold">{fL(result.amount)}</span> from churn:
          {result.sources?.length
            ? <span className="text-zinc-500"> {result.sources.map(s => `${s.sym} ${fL(s.amount)}`).join(' · ')}</span>
            : <span className="text-zinc-600"> nothing flagged for churn.</span>}
        </div>
      )}

      {/* Allocations */}
      {result.allocations.length > 0 ? (
        <div className="space-y-1.5">
          {result.allocations.map(a => (
            <div key={a.sym} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/2 p-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-white text-caption">{a.sym}</span>
                  <span className="text-nano font-mono text-zinc-600 uppercase">{a.bucket}</span>
                </div>
                <div className="text-nano text-zinc-500 font-mono mt-0.5">{a.rationale}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-black text-green text-caption">{fL(a.amount)}</div>
                <div className="text-nano text-zinc-600 font-mono">{(a.amount / result.amount * 100).toFixed(0)}%</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-caption text-zinc-500 italic">{result.note}</p>
      )}

      {result.allocations.length > 0 && (
        <p className="text-nano text-zinc-600 leading-relaxed">
          Excludes churn/watch, conviction &lt;6 &amp; model-gated names (governance/earnings landmines) · capped at 40%/name · respects locked models.
          {mode === 'rotation' && ' Cut the churn names above, redeploy as shown.'}
        </p>
      )}
    </section>
  )
}
