import { useState, lazy, Suspense } from 'react'
import portfolioData from './data/portfolio.json'
import initialMemoryData from './data/memory.json'
import filingsData from './data/filings.json'
import insightsData from './data/insights.json'
import aiInsightsData from './data/ai-insights.json'
import signalsData from './data/signals.json'
import targetsData from './config/targets.json'
import { usePortfolio } from './hooks/usePortfolio'
import { useMemoryEngine } from './hooks/useMemoryEngine'
import { useInsights } from './hooks/useInsights'
import { useCorporateActions } from './hooks/useCorporateActions'
import { useRegimeShift } from './hooks/useRegimeShift'
import {
  addThesisEntry,
  addConvictionDriftEntry,
  addIgnoredAction,
  acknowledgeCheckin,
  addInterruptBypass,
  addReflection,
  computeDisciplineStreak,
} from './lib/memoryEngine'
import { useThesisHealth } from './hooks/useThesisHealth'
import ReflectionModal from './components/ReflectionModal'
import { useEarningsMonitor } from './hooks/useEarningsMonitor'
import { useCatalystDue } from './hooks/useCatalystDue'
import { addReviewedEarningsEntry } from './lib/earningsEngine'
import Header from './components/layout/Header'
import ErrorBoundary from './components/ErrorBoundary'
import ActionWorkflowModal from './components/ActionWorkflowModal'
import ToastStack from './components/ToastStack'
import { useToast } from './hooks/useToast'

const TodayTab = lazy(() => import('./components/tabs/TodayTab'))
const InvestTab        = lazy(() => import('./components/tabs/InvestTab'))
const PortfolioTab     = lazy(() => import('./components/tabs/PortfolioTab'))
const RebalanceTab     = lazy(() => import('./components/tabs/RebalanceTab'))
const RearviewTab      = lazy(() => import('./components/tabs/RearviewTab'))
const ScreenerTab      = lazy(() => import('./components/tabs/ScreenerTab'))

function TabSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse pt-4">
      <div className="h-32 bg-white/5 rounded-2xl" />
      <div className="h-48 bg-white/5 rounded-2xl" />
      <div className="h-24 bg-white/5 rounded-2xl" />
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('cockpit')
  const [memory, setMemory] = useState(() => {
    try {
      const stored = localStorage.getItem('portfolio-memory')
      if (stored) return JSON.parse(stored)
    } catch {}
    return initialMemoryData
  })
  const [activeAction,     setActiveAction]     = useState(null)
  const [activeReflection, setActiveReflection] = useState(null)

  // P6-2: Toast system
  const { toasts, toast, dismiss } = useToast()

  const data = portfolioData
  const { holdings, totals, buckets, concentrationAlerts } = usePortfolio(data, targetsData)
  const memoryEngine = useMemoryEngine(memory, holdings, filingsData)
  const insights     = useInsights(insightsData)
  
  // P3.1 Earnings Monitor
  const earningsMonitor = useEarningsMonitor(filingsData, memory)
  
  // P3.3 Corporate Actions
  const corporateActions = useCorporateActions(data.catalysts, filingsData, holdings)

  // P3.4 Regime Shift
  const regimeShift = useRegimeShift(aiInsightsData, holdings)

  // P4.2 Catalyst due-today detection
  const catalystDue = useCatalystDue(aiInsightsData, memory.decisionLedger)

  // B2: discipline streak
  const disciplineStreak = computeDisciplineStreak(memory.discipline)

  // B3/B5: thesis health
  const thesisHealth = useThesisHealth(memory.thesisLedger || [], holdings)

  const persistMemory = (updatedMemory) => {
    setMemory(updatedMemory)
    try {
      localStorage.setItem('portfolio-memory', JSON.stringify(updatedMemory))
    } catch (err) {
      console.error('localStorage write failed — storage may be full:', err)
    }
  }

  // A4 — 3-step workflow: preview → kite → confirm with thesis + execLatencyMs
  const handleActionExecuted = async ({ action, filledQty, filledPrice, thesis, execLatencyMs }) => {
    const holding = holdings.find(h => h.sym === action.stock || h.name === action.stock)
    const today   = new Date().toISOString().split('T')[0]

    const withThesis = addThesisEntry(memory, {
      sym:           action.stock,
      thesis,
      date:          today,
      convAtEntry:   holding?.conv         ?? null,
      avgAtEntry:    holding?.avg          ?? null,
      qtyAtEntry:    holding?.qty          ?? null,
      bucket:        holding?.bucket       ?? null,
      actionType:    'buy',
      filledQty,
      filledPrice,
      execLatencyMs,
    })

    const withActionLog = {
      ...withThesis,
      actionLog: [
        ...(withThesis.actionLog || []),
        { stock: action.stock, timestamp: new Date().toISOString(), execLatencyMs }
      ]
    }

    setActiveAction(null)
    await persistMemory(withActionLog)
    toast({ message: `Execution logged for ${action.stock} — ${filledQty} sh @ ₹${filledPrice}`, type: 'success' })
  }

  // P2.1 — user dismisses a stale thesis check-in without updating
  const handleAcknowledgeCheckin = async (entryId, checkpoint) => {
    const updated = acknowledgeCheckin(memory, entryId, checkpoint)
    await persistMemory(updated)
    toast({ message: 'Check-in acknowledged', type: 'info' })
  }

  // P2.1 — user refreshes thesis text at a check-in milestone
  const handleRefreshThesis = async (entryId, newThesis) => {
    const updated = {
      ...memory,
      thesisLedger: memory.thesisLedger.map(t =>
        t.id === entryId
          ? { ...t, thesis: newThesis, lastRefreshed: new Date().toISOString().split('T')[0] }
          : t
      )
    }
    await persistMemory(updated)
    toast({ message: 'Thesis refreshed', type: 'success' })
  }

  // P2.3 — conviction score changed manually by user
  const handleConvictionDrift = async (sym, from, to, reason) => {
    const holding = holdings.find(h => h.sym === sym)
    const updated = addConvictionDriftEntry(memory, {
      sym,
      from,
      to,
      reason,
      date:          new Date().toISOString().split('T')[0],
      priceAtChange: holding?.ltp ?? null
    })
    await persistMemory(updated)
    toast({ message: `${sym} conviction updated ${from}→${to}`, type: 'success' })
  }

  // B1: user bypassed a red anti-pattern gate
  const handleInterruptBypass = async (patterns) => {
    let updated = memory
    for (const p of patterns) {
      updated = addInterruptBypass(updated, p)
    }
    await persistMemory(updated)
  }

  // B3: user completed a T+30/T+90 reflection
  const handleReflect = async (payload) => {
    const { entry, verdict, notes, pnlPctAtReflection } = payload
    const updated = addReflection(memory, entry.id, entry.checkpoint, { verdict, notes, pnlPctAtReflection })
    await persistMemory(updated)
    setActiveReflection(null)
    toast({ message: `T+${entry.checkpoint} reflection logged for ${entry.sym}`, type: 'success' })
  }

  // P1.3 — user explicitly dismisses an action recommendation
  const handleIgnoreAction = async (sym, actionText) => {
    const updated = addIgnoredAction(memory, {
      sym,
      actionText,
      date: new Date().toISOString().split('T')[0]
    })
    await persistMemory(updated)
    toast({ message: `Action dismissed for ${sym}`, type: 'info' })
  }

  return (
    <div className="min-h-screen bg-deep text-text-pri">
      <Header
        totals={{ ...totals, positionCount: holdings.length }}
        meta={data.meta}
        tab={tab}
        onTabChange={setTab}
        earningsCount={earningsMonitor.reviewCount}
        discipline={disciplineStreak}
      />
      <main className="max-w-[1400px] mx-auto p-4 md:p-7 safe-bottom">
        <Suspense fallback={<TabSkeleton />}>
          {tab === 'cockpit' && (
            <ErrorBoundary tab="Today">
              <TodayTab
                holdings={holdings}
                totals={totals}
                memory={memory}
                memoryEngine={memoryEngine}
                aiInsights={aiInsightsData}
                earningsMonitor={earningsMonitor}
                corporateActions={corporateActions}
                signals={signalsData}
                regimeShift={regimeShift}
                catalystDue={catalystDue}
                onToast={toast}
                onExecuteAction={(action) => setActiveAction(action)}
                onAcknowledgeCheckin={handleAcknowledgeCheckin}
                onPersistMemory={persistMemory}
                pendingReflections={thesisHealth.pendingReflections}
                hopePositions={thesisHealth.hopePositions}
                onReflect={setActiveReflection}
                onTabChange={setTab}
                insightsData={insightsData}
                filingsData={filingsData}
                onRefreshThesis={handleRefreshThesis}
              />
            </ErrorBoundary>
          )}

          {tab === 'invest' && (
            <ErrorBoundary tab="Invest">
              <InvestTab
                holdings={holdings}
                aiInsights={aiInsightsData}
                insightsData={insightsData}
                memory={memory}
                filingsData={filingsData}
                bucketTargets={data.bucketTargets}
                onExecuteAction={(action) => setActiveAction(action)}
                onRefreshThesis={handleRefreshThesis}
                onPersistMemory={persistMemory}
              />
            </ErrorBoundary>
          )}
          {tab === 'portfolio' && (
            <ErrorBoundary tab="Portfolio">
              <PortfolioTab
                holdings={holdings}
                totals={totals}
                bucketTargets={data.bucketTargets}
                onConvictionChange={handleConvictionDrift}
                insights={insights}
                insightsData={insightsData}
                signals={signalsData}
                aiInsights={aiInsightsData}
                corporateActions={corporateActions}
                memory={memory}
                filingsData={filingsData}
                onRefreshThesis={handleRefreshThesis}
                onPersistMemory={persistMemory}
              />
            </ErrorBoundary>
          )}

          {tab === 'rebalance' && (
            <ErrorBoundary tab="Rebalance">
              <RebalanceTab
                holdings={holdings}
                aiInsights={aiInsightsData}
                insightsData={insightsData}
                memory={memory}
                filingsData={filingsData}
                onRefreshThesis={handleRefreshThesis}
                onPersistMemory={persistMemory}
              />
            </ErrorBoundary>
          )}

          {tab === 'screener' && (
            <ErrorBoundary tab="Screener">
              <ScreenerTab />
            </ErrorBoundary>
          )}

          {tab === 'rearview' && (
            <ErrorBoundary tab="Rearview">
              <RearviewTab />
            </ErrorBoundary>
          )}

        </Suspense>
      </main>

      {activeAction && (
        <ActionWorkflowModal
          action={activeAction}
          holdings={holdings}
          totals={totals}
          data={portfolioData}
          onClose={() => setActiveAction(null)}
          onConfirm={handleActionExecuted}
          onBypass={handleInterruptBypass}
        />
      )}

      {activeReflection && (() => {
        const h = holdings.find(x => x.sym === activeReflection.sym)
        return (
          <ReflectionModal
            entry={activeReflection}
            holding={h}
            onSubmit={({ verdict, notes, pnlPctAtReflection }) =>
              handleReflect({ entry: activeReflection, verdict, notes, pnlPctAtReflection })
            }
            onClose={() => setActiveReflection(null)}
          />
        )
      })()}

      {/* P6-2: Toast notifications */}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
