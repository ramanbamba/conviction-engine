import React, { useState, useMemo } from 'react'
import { ShieldAlert } from 'lucide-react'
import { fL, fP, fR, BUCKET_ORDER, BUCKET_COLORS, convClass } from '../../lib/format'
import StockDossier from '../StockDossier'
import Accordion from '../Accordion'
import SectionCard from '../SectionCard'
import StreetConsensus from '../StreetConsensus'
import EdgePanel from '../EdgePanel'
import { Newspaper } from 'lucide-react'
import rearviewData from '../../data/rearview.json'
import fundamentalsData from '../../data/fundamentals.json'
import AlphaAttribution from '../AlphaAttribution'
import ThemeExposure from '../ThemeExposure'
import ScenarioModal from '../ScenarioModal'
import PortfolioVisuals from '../PortfolioVisuals'
import { computeModelAlignment } from '../../lib/modelAlignment'
import { positionVerdict, VERDICT_TONE_CLS } from '../../lib/positionVerdict'
import { alphaModel } from '../../lib/alphaModel'
import { computeTargetBook } from '../../lib/concentrationEngine'

const gradeColor = (g) => !g ? 'text-zinc-600'
  : /^A/.test(g) ? 'text-green' : /^B/.test(g) ? 'text-teal'
  : /^C/.test(g) ? 'text-amber' : 'text-red'

export default function PortfolioTab({
  holdings, totals, bucketTargets, insightsData, aiInsights, signals, corporateActions, onConvictionChange, memory, filingsData, onRefreshThesis, onPersistMemory
}) {
  const [bFilter, setBFilter] = useState('All')
  const [selectedSym, setSelectedSym] = useState(null)
  const [sortKey, setSortKey] = useState('value')
  const [sortDir, setSortDir] = useState(-1)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [viewMode, setViewMode] = useState('compact')

  const totalVal = holdings.reduce((s, h) => s + h.value, 0)  // for per-row weight %

  // 1. advisor model verdicts (Platinum) — fed into the unified next-move call
  const modelVerdictMap = useMemo(() => {
    const a = computeModelAlignment(holdings, bucketTargets, fundamentalsData)
    return Object.fromEntries((a?.rows || []).map(r => [r.sym, r.verdict]))
  }, [holdings, bucketTargets])

  // 1c. Alpha-model scores (the core IP — see ALPHA_MODEL.md)
  const alphaMap = useMemo(() => {
    const m = {}
    for (const h of holdings) {
      m[h.sym] = alphaModel({
        fundamentals: fundamentalsData?.stocks?.[h.sym],
        technicals: insightsData?.positions?.[h.sym]?.computedTechnicals,
        ltp: h.ltp, theme: h.theme,
        auditSeverity: aiInsights?.earningsAudit?.stocks?.[h.sym]?.severity,
        sectorRotation: aiInsights?.sectorRotation,
      })
    }
    return m
  }, [holdings, insightsData, aiInsights])

  // Canonical target book — the single source of per-stock target weight
  // (conviction × alpha, gated). Phase 10x · 2: "money where the mouth is".
  const targetBook = useMemo(() => computeTargetBook(holdings, alphaMap), [holdings, alphaMap])
  const targetMap = useMemo(() => Object.fromEntries(targetBook.rows.map(r => [r.sym, r])), [targetBook])

  // Bucket-level P&L summary for the filter strip
  const bucketStats = useMemo(() => {
    const m = {}
    for (const h of holdings) {
      if (!m[h.bucket]) m[h.bucket] = { val: 0, inv: 0, count: 0 }
      m[h.bucket].val += h.value
      m[h.bucket].inv += h.invested
      m[h.bucket].count++
    }
    return m
  }, [holdings])

  // 2. Filter holdings by bucket chip
  const filteredHoldings = useMemo(() => {
    return holdings.filter(h => bFilter === 'All' || h.bucket === bFilter)
  }, [holdings, bFilter])

  // 3. Sort holdings
  const sortedHoldings = useMemo(() => {
    const keyVal = (h) => {
      if (sortKey === 'weightPct') return h.value          // monotonic with weight
      if (sortKey === 'tgtGap') return targetMap[h.sym]?.deltaVal ?? 0
      if (sortKey === 'alpha') return alphaMap[h.sym]?.score ?? -1
      return h[sortKey] ?? 0
    }
    return [...filteredHoldings].sort((a, b) => {
      const va = keyVal(a), vb = keyVal(b)
      if (va === vb) return a.sym.localeCompare(b.sym)
      return (va - vb) * sortDir
    })
  }, [filteredHoldings, sortKey, sortDir, alphaMap, targetMap])

  // Keyboard navigation: j/k to move through holdings, Esc to close drawer
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.key === 'Escape') { setSelectedSym(null); return }
      if (e.key !== 'j' && e.key !== 'k') return
      e.preventDefault()
      if (sortedHoldings.length === 0) return
      if (selectedSym === null) { setSelectedSym(sortedHoldings[0].sym); return }
      const idx = sortedHoldings.findIndex(h => h.sym === selectedSym)
      if (idx === -1) return
      const nextIdx = e.key === 'j'
        ? Math.min(idx + 1, sortedHoldings.length - 1)
        : Math.max(idx - 1, 0)
      setSelectedSym(sortedHoldings[nextIdx].sym)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSym, sortedHoldings])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => -d)
    } else {
      setSortKey(key)
      setSortDir(-1)
    }
  }

  // Find active elements for side drawer lookup
  const activeHolding = holdings.find(h => h.sym === selectedSym)
  const activeAiStock = aiInsights?.stocks?.[selectedSym]
  const activeLegacyPos = insightsData?.positions?.[selectedSym]
  const activeFilings = insightsData?.filings || [] // standard filings lookup

  const SortHeader = ({ k, label, align = 'text-right' }) => {
    const isActive = sortKey === k
    return (
      <th 
        onClick={() => handleSort(k)}
        className={`px-3 py-2 text-meta uppercase font-black cursor-pointer select-none transition-colors hover:text-green ${align} ${isActive ? 'text-green' : 'text-zinc-500'}`}
      >
        {label} {isActive && (sortDir < 0 ? '↓' : '↑')}
      </th>
    )
  }

  return (
    <div className="space-y-6 tab-enter select-none">

      {/* ── BIG PICTURE (the overview): value · allocation · conviction map ── */}
      <PortfolioVisuals
        holdings={holdings}
        totals={totals}
        bucketTargets={bucketTargets || {}}
        insightsData={insightsData}
        onBucketFilter={setBFilter}
        onStockSelect={setSelectedSym}
      />

      {/* ── HOLDINGS: filter chips + table ── */}
      <section className="space-y-3">
        {/* ── Bucket P&L filter cards ── */}
        <div className="space-y-2 border-b border-white/5 pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* All-buckets reset pill */}
            <button
              onClick={() => setBFilter('All')}
              className={`px-3 py-1 text-meta rounded-full transition-all duration-200 font-semibold cursor-pointer ${bFilter === 'All' ? 'text-white bg-white/8 border border-white/15' : 'text-zinc-500 hover:text-zinc-300 border border-white/5'}`}
            >
              All
            </button>
            {/* View mode toggle */}
            <div className="inline-flex rounded-lg border border-white/10 overflow-hidden text-meta font-mono">
              {['Compact', 'Rich', 'Deep'].map(v => {
                const key = v.toLowerCase()
                const on = viewMode === key
                return (
                  <button key={v} onClick={() => setViewMode(key)}
                    className={`px-3 py-1 uppercase tracking-wider cursor-pointer transition-colors ${on ? 'bg-white/10 text-white font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >{v}</button>
                )
              })}
            </div>
          </div>

          {/* Bucket cards row */}
          <div className="flex gap-2 flex-wrap">
            {BUCKET_ORDER.map(b => {
              const stats = bucketStats[b] || { val: 0, inv: 0, count: 0 }
              const pnlPct = stats.inv > 0 ? (stats.val - stats.inv) / stats.inv * 100 : 0
              const active = bFilter === b
              const col = BUCKET_COLORS[b] || '#6B7280'
              return (
                <button
                  key={b}
                  onClick={() => setBFilter(b)}
                  className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer ${active ? 'bg-white/5' : 'hover:bg-white/2'}`}
                  style={{ borderColor: active ? col : 'rgba(255,255,255,0.06)' }}
                >
                  <div className="text-micro uppercase font-black tracking-wider" style={{ color: col }}>{b}</div>
                  <div className="font-mono font-bold text-white leading-tight" style={{ fontSize: '13px' }}>{fL(stats.val)}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`font-mono font-bold ${pnlPct >= 0 ? 'text-green' : 'text-red'}`} style={{ fontSize: '11px' }}>
                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                    </span>
                    <span className="text-zinc-600 text-micro">{stats.count}p</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      {/* ── TARGET BOOK: the canonical money-vs-mouth headline (Phase 10x · 2) ── */}
      {(() => {
        const cutValue = targetBook.cut.reduce((a, r) => a + r.curVal, 0)
        return (
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap px-1 pb-3 text-meta font-mono">
            <span className="uppercase tracking-wider text-zinc-400 font-black">Target Book</span>
            <span className="text-zinc-600 hidden sm:inline">capital follows conviction × alpha</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-400">eff N <span className="text-white font-bold">{targetBook.effectiveNow.toFixed(1)}</span> <span className="text-zinc-700">→</span> <span className="text-green font-bold">{targetBook.effectiveTarget.toFixed(1)}</span></span>
            <span className="text-zinc-700">·</span>
            <span className="text-amber font-bold">{fL(cutValue)}</span><span className="text-zinc-500">low-edge tail</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-400">core <span className="text-white font-bold">{targetBook.coreCount}</span></span>
            <span className="text-zinc-600 ml-auto hidden md:inline">north star, not a daily mandate — drift via new capital + cuts</span>
          </div>
        )
      })()}
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse text-body md:text-base">
          <thead>
            <tr className="border-b border-white/5 text-zinc-500">
              <th className="px-3 py-2 text-meta font-black text-left">Symbol</th>
              <SortHeader k="value" label="Value" />
              {viewMode === 'rich' && <SortHeader k="tgtGap" label="Wt → Target" />}
              <SortHeader k="pnlPct" label="P&L %" />
              {viewMode === 'rich' && <SortHeader k="conv" label="Conv" />}
              {viewMode === 'rich' && <th className="px-3 py-2 text-meta font-black text-right">Grade</th>}
              {viewMode === 'rich' && <SortHeader k="alpha" label="α" />}
              {viewMode === 'rich' && <th className="px-3 py-2 text-meta font-black text-right">Cost → CMP</th>}
              {viewMode === 'deep' && <th className="px-3 py-2 text-meta font-black text-right">52w Range</th>}
              {viewMode === 'deep' && <th className="px-3 py-2 text-meta font-black text-right">RSI</th>}
              {viewMode === 'deep' && <th className="px-3 py-2 text-meta font-black text-right">vs SMA200</th>}
              {viewMode === 'deep' && <th className="px-3 py-2 text-meta font-black text-right">Valuation</th>}
              <th className="px-3 py-2 text-meta font-black text-right hidden sm:table-cell">Next Move</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/2">
            {sortedHoldings.map(h => {
              const pnlCol = h.pnl >= 0 ? 'text-green' : 'text-red'
              const verdict = positionVerdict(h, fundamentalsData?.stocks?.[h.sym], { modelVerdict: modelVerdictMap[h.sym] })
              const isSelected = h.sym === selectedSym
              return (
                <tr
                  key={h.sym}
                  onClick={() => setSelectedSym(h.sym)}
                  className={`group hover:bg-white/2 cursor-pointer transition-colors ${
                    isSelected ? 'bg-white/5 text-white font-bold' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-mono font-black text-white flex items-center gap-2">
                    {h.sym}
                    {h.exitSignal && (
                      <span className="text-micro font-black border border-red/20 uppercase bg-red/10 text-red px-1 rounded animate-pulse">EXIT</span>
                    )}
                    {h.ltp && h.sl && h.ltp <= h.sl && (
                      <span className="text-micro font-black border border-red/20 uppercase bg-red/10 text-red px-1 animate-pulse">BREACH</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-300">{fL(h.value)}</td>
                  {viewMode === 'rich' && (() => {
                    const tb = targetMap[h.sym]
                    const curW = h.value / totalVal * 100
                    if (!tb) return <td className="px-3 py-2 text-right font-mono whitespace-nowrap"><span className="text-zinc-400">{curW.toFixed(1)}%</span> <span className="text-zinc-700">· strat</span></td>
                    const offBand = Math.abs(tb.deltaPct) >= 2.5   // deadband — quiet within ±2.5pp
                    const dir = tb.action === 'CUT' ? { s: 'CUT', c: 'text-red' }
                      : !offBand ? { s: '', c: 'text-zinc-500' }
                      : tb.deltaPct > 0 ? { s: '▲', c: 'text-green' }
                      : { s: '▼', c: 'text-amber' }
                    return (
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap" title={offBand ? `${tb.action} ${tb.deltaVal >= 0 ? '+' : ''}${fL(tb.deltaVal)} to target` : 'on target (within deadband)'}>
                        <span className="text-zinc-500">{curW.toFixed(1)}</span>
                        <span className="text-zinc-700"> → </span>
                        <span className={dir.c}>{tb.tgtPct.toFixed(1)}%{dir.s && <span className="ml-1">{dir.s}</span>}</span>
                      </td>
                    )
                  })()}
                  <td className={`px-3 py-2 text-right font-mono font-bold ${pnlCol}`}>{fP(h.pnlPct)}</td>
                  {viewMode === 'rich' && (
                    <td className={`px-3 py-2 text-right font-mono font-bold ${convClass(h.conv)}`}>{h.conv ?? '—'}</td>
                  )}
                  {viewMode === 'rich' && (() => {
                    const g = fundamentalsData?.stocks?.[h.sym]?.grade
                    return <td className={`px-3 py-2 text-right font-mono font-black ${gradeColor(g)}`}>{g || '—'}</td>
                  })()}
                  {viewMode === 'rich' && (() => {
                    const am = alphaMap[h.sym]
                    const cls = !am ? 'text-zinc-600' : am.tier === 'STRONG' ? 'text-green' : am.tier === 'NEGATIVE' ? 'text-red' : am.tier === 'POSITIVE' ? 'text-teal' : 'text-amber'
                    return <td className={`px-3 py-2 text-right font-mono font-bold ${cls}`} title={am ? `${am.tier} · driver ${am.driver} · risk ${am.risk}` : ''}>{am?.score ?? '—'}</td>
                  })()}
                  {viewMode === 'rich' && (
                    <td className="px-3 py-2 text-right font-mono text-micro text-zinc-500 whitespace-nowrap">{fR(h.avg)} → <span className="text-zinc-300">{fR(h.ltp)}</span></td>
                  )}
                  {viewMode === 'deep' && (() => {
                    const tech = insightsData?.positions?.[h.sym]?.computedTechnicals
                    if (!tech?.fiftyTwoWeekHigh || !tech?.fiftyTwoWeekLow) {
                      return <td className="px-3 py-2 text-right font-mono text-zinc-600">—</td>
                    }
                    const range = tech.fiftyTwoWeekHigh - tech.fiftyTwoWeekLow
                    const pct = range > 0 ? Math.max(0, Math.min(100, (h.ltp - tech.fiftyTwoWeekLow) / range * 100)) : 50
                    const fromHi = tech.fromHighPct ?? 0
                    return (
                      <td className="px-3 py-2">
                        <div className="w-20 ml-auto">
                          <div className="h-[3px] bg-white/8 rounded-full">
                            <div className="h-full bg-amber/60 rounded-full" style={{ width: `${pct.toFixed(0)}%` }} />
                          </div>
                          <div className="font-mono text-right mt-0.5" style={{ fontSize: '10px', color: fromHi >= -10 ? '#10B981' : fromHi >= -25 ? '#F59E0B' : '#EF4444' }}>
                            {fromHi}% hi
                          </div>
                        </div>
                      </td>
                    )
                  })()}
                  {viewMode === 'deep' && (() => {
                    const tech = insightsData?.positions?.[h.sym]?.computedTechnicals
                    const rsi = tech?.rsi14
                    const cls = rsi == null ? 'text-zinc-600' : rsi > 70 ? 'text-red font-bold' : rsi < 30 ? 'text-green font-bold' : 'text-zinc-400'
                    const label = rsi == null ? '—' : rsi.toFixed(0)
                    const title = rsi == null ? '' : rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral'
                    return <td className={`px-3 py-2 text-right font-mono ${cls}`} title={title}>{label}</td>
                  })()}
                  {viewMode === 'deep' && (() => {
                    const tech = insightsData?.positions?.[h.sym]?.computedTechnicals
                    const v = tech?.vsSma200Pct
                    const cls = v == null ? 'text-zinc-600' : v >= 0 ? 'text-green' : 'text-red'
                    return <td className={`px-3 py-2 text-right font-mono ${cls}`}>{v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—'}</td>
                  })()}
                  {viewMode === 'deep' && (() => {
                    const aiStock = aiInsights?.stocks?.[h.sym]
                    const val = aiStock?.valuation
                    return (
                      <td className="px-3 py-2 text-right font-mono text-zinc-500 text-micro max-w-[140px] truncate" title={val || ''}>
                        {val || '—'}
                      </td>
                    )
                  })()}
                  <td className="px-3 py-2 text-right hidden sm:table-cell" title={verdict?.reason || ''}>
                    <span className={`font-black uppercase font-mono ${VERDICT_TONE_CLS[verdict?.tone] || 'text-zinc-500'}`}>{verdict?.call || 'HOLD'}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </section>

      {/* ── STREET VIEW: brokerage TPs + catalysts, freshness-tracked ── */}
      <SectionCard
        icon={<Newspaper className="w-3.5 h-3.5" />}
        title="Street View"
        summary="brokerage consensus TP · order wins · results · the 30-day intelligence feed"
        defaultOpen={false}
      >
        <StreetConsensus holdings={holdings} onSelect={setSelectedSym} />
      </SectionCard>

      {/* ── ANALYSIS (one-click-deeper): alpha · themes · edge ── */}
      <section className="space-y-2 border-t border-white/5 pt-4">
        <Accordion title={<span className="text-meta uppercase tracking-wider">Analysis · alpha, themes, edge</span>} className="pb-2">
          <div className="pt-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <AlphaAttribution holdings={holdings} />
              <ThemeExposure holdings={holdings} />
            </div>
            <EdgePanel memory={memory} holdings={holdings} />
          </div>
        </Accordion>

        <div className="pt-2">
          <button
            onClick={() => setScenarioOpen(true)}
            className="px-2.5 py-0.5 rounded border border-red/30 bg-red/10 text-red hover:bg-red/20 font-bold text-micro uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
          >
            <ShieldAlert className="w-3 h-3" /> Stress Test
          </button>
        </div>
      </section>

      {/* ── STOCK DOSSIER overlay lookup details ── */}
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

      {/* ── SCENARIO SIMULATOR overlay ── */}
      <ScenarioModal
        isOpen={scenarioOpen}
        onClose={() => setScenarioOpen(false)}
        holdings={holdings}
      />

    </div>
  )
}
