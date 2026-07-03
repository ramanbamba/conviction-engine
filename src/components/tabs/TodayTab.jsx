import React, { useMemo, useState } from 'react'
import { TrendingUp, RefreshCw, BarChart2, Activity, Shield, Calendar, FileText } from 'lucide-react'
import AlphaHeroBar from '../AlphaHeroBar'
import EmptyState from '../EmptyState'
import SectionCard from '../SectionCard'
import DailyPulseStrip from '../DailyPulseStrip'
import ConvictionChangelog from '../ConvictionChangelog'
import Guardrails from '../Guardrails'
import PMTab from './PMTab'
import CalibrationCard from '../CalibrationCard'
import FocusCard from '../FocusCard'
import ModelEdge from '../ModelEdge'
import DecisionLedger from '../DecisionLedger'
import ActionFeed from '../ActionFeed'
import ResultsDesk, { upcomingPrints } from '../ResultsDesk'
import StockDossier from '../StockDossier'
import { today, daysBetween } from '../../lib/date'

export default function TodayTab({
  holdings, totals, memory, memoryEngine, aiInsights, earningsMonitor,
  corporateActions, signals, regimeShift, catalystDue, onToast, onExecuteAction,
  onAcknowledgeCheckin, onPersistMemory, pendingReflections = [], hopePositions = [], onReflect, onTabChange,
  insightsData, filingsData, onRefreshThesis
}) {
  const [loggingCatalyst, setLoggingCatalyst] = useState(null)
  const [catalystFormData, setCatalystFormData] = useState({ ltp: '', guidance: '', notes: '' })
  const [optimisticSubmittedCatalysts, setOptimisticSubmittedCatalysts] = useState([])
  const [selectedSym, setSelectedSym] = useState(null)

  const resultsDeskPrints = useMemo(() => upcomingPrints(7), [])

  const { staleTheses = [] } = memoryEngine || {}

  // 1. Filter out already logged catalysts
  const dueTodayFiltered = useMemo(() => (
    (catalystDue?.dueToday || []).filter(c => !optimisticSubmittedCatalysts.includes(c.event))
  ), [catalystDue, optimisticSubmittedCatalysts])

  // Overdue catalysts go stale fast — a results outcome 2+ weeks old is no longer a
  // live task. Cap to the last 10 days so the backlog self-clears instead of piling up.
  const overdueFiltered = useMemo(() => (
    (catalystDue?.overdue || [])
      .filter(c => !optimisticSubmittedCatalysts.includes(c.event))
      .filter(c => !c.date || daysBetween(c.date, today()) <= 10)
  ), [catalystDue, optimisticSubmittedCatalysts])

  // 2. Compute SL Breaches or near-SL items for alert list
  const activeAlerts = useMemo(() => {
    const list = []
    holdings.forEach(h => {
      if (!h.sl || !h.ltp) return
      const pctFromSL = (h.ltp - h.sl) / h.sl * 100
      if (h.ltp <= h.sl) {
        list.push({ type: 'BREACH', sym: h.sym, ltp: h.ltp, sl: h.sl, text: `CRITICAL: ${h.sym} breached SL ₹${h.sl} (CMP ₹${h.ltp})` })
      } else if (pctFromSL <= 3) {
        list.push({ type: 'NEAR_SL', sym: h.sym, ltp: h.ltp, sl: h.sl, text: `Warning: ${h.sym} at ₹${h.ltp} — ${pctFromSL.toFixed(1)}% above SL ₹${h.sl}` })
      }
    })
    
    // Add exitSignal positions
    holdings.forEach(h => {
      if (h.exitSignal) {
        list.push({ type: 'EXIT', sym: h.sym, text: `EXIT ${h.sym} — advisor model exit signal active.` })
      }
    })
    return list
  }, [holdings])


  // 4. NSE corporate ex-date alerts within 7 days (instead of 14)
  const upcomingSevenDaysCAs = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return (aiInsights?.catalystAlerts || []).filter(a => {
      if (a.source !== 'nse-ca-auto') return false
      if (a.date <= today) return false
      const diffDays = Math.round((new Date(a.date) - new Date(today)) / 86400000)
      return diffDays <= 7
    }).sort((a, b) => a.date < b.date ? -1 : 1)
  }, [aiInsights])

  // Form submit handler for catalysts
  const handleCatalystSubmit = async (e) => {
    e.preventDefault()
    if (!loggingCatalyst) return
    const sym = loggingCatalyst.stocks[0]
    const outcomeObj = {
      date: new Date().toISOString().split('T')[0],
      ltpAtOutcome: parseFloat(catalystFormData.ltp),
      resultData: { guidance: catalystFormData.guidance, notes: catalystFormData.notes }
    }
    let decisionLedger = [...(memory?.decisionLedger || [])]
    const index = decisionLedger.findIndex(d => d.sym === sym && !d.outcome)
    if (index !== -1) {
      decisionLedger[index] = { ...decisionLedger[index], outcome: outcomeObj }
    } else {
      decisionLedger.push({ id: `decision-${sym}-manual-${Date.now()}`, sym, eventLabel: loggingCatalyst.event, eventDate: loggingCatalyst.date, outcome: outcomeObj })
    }
    await onPersistMemory({ ...memory, decisionLedger })
    setOptimisticSubmittedCatalysts([...optimisticSubmittedCatalysts, loggingCatalyst.event])
    onToast?.({ message: `Logged outcome for ${sym}`, type: 'success' })
    setLoggingCatalyst(null)
    setCatalystFormData({ ltp: '', guidance: '', notes: '' })
  }

  return (
    <div className="space-y-3 tab-enter select-none">

      {/* ── HERO: THE DECISION — ratifiable PM decisions only (watch/standing folded into the feed) ── */}
      <PMTab memory={memory} onPersistMemory={onPersistMemory} decisionsOnly />

      {/* ── THE ONE FEED: everything that needs you, ranked + de-duped (Phase 10x · 1) ── */}
      <ActionFeed holdings={holdings} alerts={activeAlerts} catalysts={upcomingSevenDaysCAs} />


      {/* ── SECONDARY SURFACE (collapsed by default) ── */}
      <SectionCard
        icon={<BarChart2 className="w-3.5 h-3.5" />}
        title="Performance Mirror"
        summary="calibration + concentration nudge"
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <CalibrationCard holdings={holdings} />
          <FocusCard holdings={holdings} />
        </div>
        <div className="mt-4">
          <ModelEdge holdings={holdings} />
        </div>
        <div className="mt-4">
          <DecisionLedger />
        </div>
      </SectionCard>

      <SectionCard
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        title="Alpha vs Nifty"
        summary="equity curve vs benchmark"
        defaultOpen={false}
      >
        <AlphaHeroBar />
      </SectionCard>

      <SectionCard
        icon={<Activity className="w-3.5 h-3.5" />}
        title="Daily Pulse"
        summary="signals · movers · regime shifts"
        defaultOpen={false}
      >
        <DailyPulseStrip signals={signals} aiInsights={aiInsights} />
      </SectionCard>

      <SectionCard
        icon={<RefreshCw className="w-3.5 h-3.5" />}
        title="Conviction Re-scores"
        summary="weekly auto re-score digest + veto"
        defaultOpen={false}
      >
        <ConvictionChangelog onToast={onToast} />
      </SectionCard>

      <SectionCard
        icon={<Shield className="w-3.5 h-3.5" />}
        title="Guardrails"
        summary="rearview lessons fired forward"
        defaultOpen={false}
      >
        <Guardrails holdings={holdings} />
      </SectionCard>

      {/* Results to log — only renders when there's something pending */}
      {(dueTodayFiltered.length + overdueFiltered.length) > 0 && (
        <SectionCard
          icon={<Calendar className="w-3.5 h-3.5" />}
          title="Results to Log"
          badge={String(dueTodayFiltered.length + overdueFiltered.length)}
          badgeColor="var(--red)"
          defaultOpen={true}
        >
          <div className="space-y-2">
            {[...dueTodayFiltered.map(a => ({ ...a, _due: true })), ...overdueFiltered.map(a => ({ ...a, _due: false }))].map((alert, idx) => (
              <div key={idx} className="flex items-start justify-between gap-4 py-1.5 border-b border-white/5">
                <div className="min-w-0">
                  <span className={`text-micro font-black px-1.5 py-0.5 rounded mr-2 inline-block border ${alert._due ? 'bg-red/10 border-red/25 text-red' : 'bg-amber/10 border-amber/25 text-amber'}`}>
                    {alert._due ? 'DUE TODAY' : 'OVERDUE'}
                  </span>
                  <strong className="text-white text-body font-mono">{(alert.stocks || []).join(', ')}</strong>
                  <p className="text-body text-zinc-400 mt-0.5">"{alert.event}"</p>
                </div>
                <button
                  onClick={() => setLoggingCatalyst(alert)}
                  className={`text-meta hover:underline uppercase font-black shrink-0 tracking-widest cursor-pointer ${alert._due ? 'text-red' : 'text-amber'}`}
                >
                  Log Outcome
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Results Desk — only renders when a held name prints within +/-7 days (Phase 23) */}
      {resultsDeskPrints.length > 0 && (
        <SectionCard
          icon={<FileText className="w-3.5 h-3.5" />}
          title="Results Desk"
          badge={`${resultsDeskPrints.length} printing`}
          badgeColor="var(--amber)"
          defaultOpen={true}
        >
          <ResultsDesk onSelect={setSelectedSym} />
        </SectionCard>
      )}

      {/* Catalysts timeline — only renders when there are events in the next 7 days */}
      {upcomingSevenDaysCAs.length > 0 && (
        <SectionCard
          icon={<Calendar className="w-3.5 h-3.5" />}
          title="Catalysts — Next 7 Days"
          badge={`${upcomingSevenDaysCAs.length} events`}
          badgeColor="var(--amber)"
          defaultOpen={false}
        >
          <div className="space-y-2 text-body">
            {upcomingSevenDaysCAs.map((alert, idx) => (
              <div key={idx} className="bg-white/2 border border-white/5 rounded-xl p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <strong className="text-white font-mono">{(alert.stocks || []).join(', ')}</strong>
                    <span className="text-nano text-zinc-500 font-mono bg-zinc-800/40 border border-zinc-700 px-1 py-0.5 rounded">
                      CA ex-date
                    </span>
                  </div>
                  <p className="text-zinc-400 text-body">"{alert.event}"</p>
                  {alert.portfolioAction && (
                    <p className="text-amber italic text-caption mt-1">Action: {alert.portfolioAction}</p>
                  )}
                </div>
                <span className="text-zinc-400 font-mono text-caption font-bold shrink-0">
                  {alert.date}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}


      {/* ── MODALS ── */}
      {loggingCatalyst && (
        <div className="fixed inset-0 bg-dark/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <form onSubmit={handleCatalystSubmit} className="bg-card border border-zinc-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div>
              <div className="text-meta text-red uppercase tracking-wider font-bold">Log Catalyst Outcome</div>
              <h3 className="text-body font-black text-white font-mono mt-1">{(loggingCatalyst.stocks || []).join(', ')} — {loggingCatalyst.event}</h3>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-caption text-zinc-400 uppercase tracking-wider font-bold block mb-1">
                  Last Traded Price (LTP)
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={catalystFormData.ltp}
                  onChange={e => setCatalystFormData({ ...catalystFormData, ltp: e.target.value })}
                  placeholder="Enter LTP at event outcome..."
                  className="w-full bg-dark border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-caption text-zinc-400 uppercase tracking-wider font-bold block mb-1">
                  Corporate Guidance One-Liner
                </label>
                <input
                  required
                  type="text"
                  value={catalystFormData.guidance}
                  onChange={e => setCatalystFormData({ ...catalystFormData, guidance: e.target.value })}
                  placeholder="Management outlook/guidance in 1 line..."
                  className="w-full bg-dark border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-caption text-zinc-400 uppercase tracking-wider font-bold block mb-1">
                  Outcome Notes & Analysis
                </label>
                <textarea
                  required
                  rows="3"
                  value={catalystFormData.notes}
                  onChange={e => setCatalystFormData({ ...catalystFormData, notes: e.target.value })}
                  placeholder="Thesis adjustments, earnings highlights, etc..."
                  className="w-full bg-dark border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-zinc-500 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setLoggingCatalyst(null); setCatalystFormData({ ltp: '', guidance: '', notes: '' }) }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold py-2 rounded-lg text-xs cursor-pointer text-center"
              >
                I'll log it later
              </button>
              <button
                type="submit"
                className="flex-1 bg-red hover:bg-red-600 text-white font-bold py-2 rounded-lg text-xs cursor-pointer text-center"
              >
                Log Outcome
              </button>
            </div>
          </form>
        </div>
      )}

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
