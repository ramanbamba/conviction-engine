import React, { useMemo, useState } from 'react'
import { fL } from '../../lib/format'
import { RotateCw, AlignCenter, TrendingUp, Gauge, Radar } from 'lucide-react'
import EmptyState from '../EmptyState'
import IdealPortfolio from '../IdealPortfolio'
import ModelAlignment from '../ModelAlignment'
import DeploymentOptimizer from '../DeploymentOptimizer'
import RotationAlpha from '../RotationAlpha'
import OpportunityRadar from '../OpportunityRadar'
import StockDossier from '../StockDossier'
import SectionCard from '../SectionCard'
import SectionHeader from '../SectionHeader'

export default function InvestTab({ holdings, aiInsights, insightsData, memory, filingsData, bucketTargets, onExecuteAction, onRefreshThesis, onPersistMemory }) {
  const [selectedSym, setSelectedSym] = useState(null)
  const idleCash = aiInsights?.deployableCash ?? 0 // real value when synced; not fabricated
  
  // Find LIQUIDBEES holding to show actual value and target
  const liquidBees = holdings?.find(h => h.sym === 'LIQUIDBEES')
  const beesVal = liquidBees ? liquidBees.value : 10000
  const beesTarget = liquidBees ? liquidBees.tgtVal : 200000

  // Filter and prioritize actionable queue items
  const actionable = useMemo(() => {
    if (!aiInsights?.actionQueue) return []
    // Get buy/build/exit/hedge items
    return aiInsights.actionQueue
      .filter(a => ['BUY NOW', 'BUILD', 'EXIT', 'HEDGE', 'BUY'].includes(a.tag?.toUpperCase()))
      .slice(0, 5)
  }, [aiInsights])

  return (
    <div className="space-y-4 tab-enter select-none">

      {/* ── THE LAB: deploy exploration, not a decision wall (Phase 10x · 3) ── */}
      <SectionHeader
        title="The Deploy Lab"
        subtitle="Where new money goes, and why. The day's actions live on Today, the canonical book on Portfolio — this is the bench where you size the next rupee."
      />

      {/* ── IDEAL PORTFOLIO COMPASS: where new money leans ── */}
      <IdealPortfolio holdings={holdings} />

      {/* ── SECTOR ROTATION MAP ── */}
      {aiInsights?.sectorRotation && (
        <SectionCard
          icon={<RotateCw className="w-3.5 h-3.5" />}
          title="Sector Rotation"
          summary={`${aiInsights.sectorRotation.marketPhase} · ${aiInsights.sectorRotation.sectors?.length ?? 0} sectors mapped`}
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {aiInsights.sectorRotation.sectors.map(s => {
              const pCls = s.phase.startsWith('markup') ? 'text-green border-green/30 bg-green/10'
                : s.phase.startsWith('accumulation') ? 'text-teal border-teal/30 bg-teal/10'
                : 'text-amber border-amber/30 bg-amber/10'
              return (
                <div key={s.name} className="rounded-lg border border-white/5 bg-dark/40 p-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-white text-caption">{s.name}</span>
                    <span className={`text-meta font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${pCls}`}>{s.phase}</span>
                  </div>
                  <p className="text-meta text-text-dim leading-snug">{s.take}</p>
                  <div className="text-meta font-mono text-text-dim">
                    {s.picks.map(p => <span key={p.sym} className="mr-3"><span className="text-text-sec font-bold">{p.sym}</span> <span className="text-text-dim">{p.why}</span></span>)}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* ── ROTATION ALPHA: positioned for THIS regime? ── */}
      <SectionCard
        icon={<Gauge className="w-3.5 h-3.5" />}
        title="Rotation Alpha"
        summary="capital in leaders vs laggards · momentum-tiered FEED / CULL"
        defaultOpen={false}
      >
        <RotationAlpha holdings={holdings} insightsData={insightsData} onSelect={setSelectedSym} />
      </SectionCard>

      {/* ── OPPORTUNITY RADAR: the next WABAG isn't in the book yet ── */}
      <SectionCard
        icon={<Radar className="w-3.5 h-3.5" />}
        title="Opportunity Radar"
        summary="Nifty 200 hunt — AlphaModel run over names you don't own yet"
        defaultOpen={false}
      >
        <OpportunityRadar />
      </SectionCard>

      {/* ── SANDIP MODEL ALIGNMENT ── */}
      <SectionCard
        icon={<AlignCenter className="w-3.5 h-3.5" />}
        title="Model Alignment"
        summary="advisor model gap — where you're over/under vs ideal"
        defaultOpen={false}
      >
        <ModelAlignment holdings={holdings} bucketTargets={bucketTargets} onSelect={setSelectedSym} />
      </SectionCard>

      {/* ── DEPLOYMENT OPTIMIZER ── */}
      <SectionCard
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        title="Deployment Optimizer"
        summary="gate-filtered ranking — where the next rupee earns most"
        defaultOpen={false}
      >
        <DeploymentOptimizer holdings={holdings} />
      </SectionCard>

      {/* ── CASH STATUS: compact two-col row ── */}
      <section className="flex gap-6 border-b border-white/5 pb-5 font-mono">
        <div className="space-y-0.5 flex-1 min-w-0">
          <div className="text-meta text-zinc-500">Deployable Cash</div>
          <div className="text-heading font-black text-white leading-none">{idleCash > 0 ? fL(idleCash) : '—'}</div>
          <div className="text-caption text-zinc-600">{idleCash > 0 ? 'Idle · Zerodha Kite' : 'Sync from Kite'}</div>
        </div>
        <div className="w-px bg-white/5 shrink-0" />
        <div className="space-y-0.5 flex-1 min-w-0">
          <div className="text-meta text-zinc-500">Crash Buffer</div>
          <div className="text-heading font-black text-zinc-400 leading-none">{fL(beesVal)}</div>
          <div className="text-caption text-zinc-600">Target {fL(beesTarget)} · deploy Nifty −8%</div>
        </div>
      </section>

      {/* ── CAPITAL ALLOCATION QUEUE ── */}
      <section className="space-y-2">
        <div className="text-meta">Capital Allocation Queue</div>
        
        {actionable.length > 0 ? (
          <div className="divide-y divide-white/2">
            {actionable.map((action, idx) => (
              <div
                key={idx}
                onClick={() => onExecuteAction?.(action)}
                className="group hover:bg-white/2 cursor-pointer transition-colors py-3 flex justify-between items-start gap-2 text-body md:text-base"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-zinc-500 font-mono text-body w-4">{idx + 1}.</span>
                  <span className={`text-micro font-black font-mono border px-1.5 py-0.5 rounded whitespace-nowrap ${
                    action.tag === 'EXIT' ? 'text-red bg-red/10 border-red/20' :
                    action.tag === 'BUY NOW' || action.tag === 'BUY' ? 'text-green bg-green/10 border-green/20' :
                    action.tag === 'BUILD' ? 'text-amber bg-amber/10 border-amber/20' :
                    'text-zinc-400 bg-zinc-800 border-zinc-700'
                  }`}>
                    {action.tag}
                  </span>
                  <span className="font-black text-white font-mono shrink-0">{action.stock}</span>
                  <span className="text-zinc-400 line-clamp-2 sm:line-clamp-1">{action.action}</span>
                </div>
                
                <div className="flex items-center gap-3 shrink-0">
                  {action.urgency && (
                    <span className={`text-micro font-black font-mono border px-1.5 py-0.5 rounded whitespace-nowrap ${
                      action.urgency === 'TODAY' ? 'text-red bg-red/10 border-red/20' :
                      action.urgency === 'THIS_WEEK' ? 'text-amber bg-amber/10 border-amber/20' :
                      'text-zinc-500 bg-white/5 border-white/5'
                    }`}>
                      {action.urgency}
                    </span>
                  )}
                  <span className="text-meta text-green group-hover:underline uppercase tracking-widest font-black text-right min-w-[40px]">
                    Act →
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Portfolio fully aligned." sub="No pending capital-allocation actions — every rupee is where the model wants it." />
        )}
      </section>

      <StockDossier
        sym={selectedSym}
        isOpen={selectedSym != null}
        onClose={() => setSelectedSym(null)}
        holdings={holdings}
        aiInsights={aiInsights}
        memory={memory}
        insightsData={insightsData}
        filingsData={filingsData}
        onRefreshThesis={onRefreshThesis}
        onPersistMemory={onPersistMemory}
      />
    </div>
  )
}
