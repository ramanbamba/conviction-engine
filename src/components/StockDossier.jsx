import React, { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertCircle, Calendar, Newspaper, Clock, TrendingUp, RefreshCw, BarChart2 } from 'lucide-react'
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Tooltip, ReferenceLine, CartesianGrid
} from 'recharts'
import { fL, fR, fP, fN } from '../lib/format'
import { useStockDossier } from '../hooks/useStockDossier'
import StatusBadge from './StatusBadge'
import { stockGuardrail } from '../lib/guardrails'
import { positionVerdict, VERDICT_BADGE } from '../lib/positionVerdict'
import { alphaModel } from '../lib/alphaModel'
import FreshnessChip from './FreshnessChip'
import { computeModelAlignment } from '../lib/modelAlignment'
import fundamentalsData from '../data/fundamentals.json'
import rearviewData from '../data/rearview.json'

export default function StockDossier({
  sym,
  isOpen,
  onClose,
  holdings = [],
  aiInsights = {},
  memory = {},
  insightsData = {},
  filingsData = [],
  onRefreshThesis,
  onPersistMemory
}) {
  const dossier = useStockDossier(sym, { holdings, aiInsights, memory, insightsData, filingsData })
  const [isEditingThesis, setIsEditingThesis] = useState(false)
  const [thesisText, setThesisText] = useState('')
  const [isExpandingThesis, setIsExpandingThesis] = useState(false)
  const [isExpandingAiSummary, setIsExpandingAiSummary] = useState(false)
  const [error, setError] = useState('')

  // Close on Escape key press, handle inline e/c hotkeys if dossier is open
  useEffect(() => {
    if (!isOpen) return
    // Lock the page behind the overlay so only the dossier scrolls
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return

      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'e') {
        e.preventDefault()
        setIsEditingThesis(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  // Reset states when stock changes
  useEffect(() => {
    if (dossier?.thesisEntries?.[0]) {
      setThesisText(dossier.thesisEntries[0].thesis)
    } else if (dossier?.brain?.thesis) {
      setThesisText(dossier.brain.thesis)
    } else {
      setThesisText('')
    }
    setIsEditingThesis(false)
    setIsExpandingThesis(false)
    setIsExpandingAiSummary(false)
    setError('')
  }, [sym, dossier])

  // Unified next-move verdict (defers to advisor model gap for Platinum).
  // Declared before the early return so hook order stays stable across renders.
  const nextMove = useMemo(() => {
    const h = dossier?.holding
    if (!h) return null
    const align = h.bucket === 'Platinum' ? computeModelAlignment(holdings, undefined, fundamentalsData) : null
    const mv = align?.rows?.find(r => r.sym === h.sym)?.verdict
    return positionVerdict(h, fundamentalsData?.stocks?.[h.sym], { modelVerdict: mv })
  }, [dossier, holdings])

  if (!isOpen || !dossier) return null

  const {
    holding,
    brain,
    aiStock,
    thesisEntries,
    convictionHistory,
    technicals,
    filings,
    catalysts,
    alphaContribution,
    thesisAgeDays,
    thesisNeedsRefresh,
    peers,
    news,
    fundamentals
  } = dossier

  const name = holding?.name || brain?.name || sym
  const bucket = holding?.bucket || ''
  const guardrail = stockGuardrail(sym, holdings, rearviewData)

  // ── Conviction breakdown data formatting ──
  const barData = Object.entries(brain?.dimensions || {}).map(([key, val]) => {
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
    return { name: label, value: val ?? 0, rawValue: val }
  })
  const hasBrainDimensions = barData.some(d => d.rawValue !== null)

  // ── Trajectory data formatting ──
  const lineData = convictionHistory.map(c => ({
    date: c.date,
    score: c.to,
    from: c.from,
    reason: c.reason,
    priceAtChange: c.priceAtChange
  }))

  const getBarColor = (val) => {
    if (val === null || val === undefined) return '#1C1917' // stone-900 (zinc-800 equivalent)
    if (val >= 7) return '#10B981' // green
    if (val >= 4) return '#F59E0B' // amber
    return '#EF4444' // red
  }

  const handleThesisSubmit = (e) => {
    e.preventDefault()
    if (thesisText.trim().length < 10) {
      setError('Thesis must be at least 10 characters long.')
      return
    }

    const latestEntry = thesisEntries?.[0]
    if (latestEntry?.id) {
      onRefreshThesis?.(latestEntry.id, thesisText.trim())
    } else {
      // Create new thesis entry fallback
      const todayDate = new Date().toISOString().split('T')[0]
      const updatedLedger = [
        ...(memory.thesisLedger || []),
        {
          id: `thesis-${sym}-${Date.now()}`,
          sym,
          thesis: thesisText.trim(),
          date: todayDate,
          convAtEntry: holding?.conv ?? 7,
          avgAtEntry: holding?.avg ?? null,
          bucket: holding?.bucket ?? null,
          actionType: 'buy'
        }
      ]
      onPersistMemory?.({ ...memory, thesisLedger: updatedLedger })
    }
    setIsEditingThesis(false)
  }

  // Strip markdown formatting from thesis text for clean display
  const stripMd = (s) => s?.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s/gm, '') ?? ''

  // Calculate 52w range position indicator
  const rangePct = technicals?.high52w && technicals?.low52w && holding?.ltp
    ? ((holding.ltp - technicals.low52w) / (technicals.high52w - technicals.low52w)) * 100
    : null

  // RSI horizontal color zone
  const getRsiColor = (rsi) => {
    if (rsi === null) return 'text-zinc-500'
    if (rsi >= 60 || rsi <= 30) return 'text-red'
    if (rsi >= 50 || rsi <= 40) return 'text-amber'
    return 'text-green'
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-4 select-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#020610]/95 backdrop-blur-md" onClick={onClose} />

      {/* Main Dossier Card overlay — dvh for iOS dynamic toolbar; height-capped */}
      <div className="bg-[#050D18] border border-white/10 rounded-2xl w-full max-w-5xl h-[92dvh] sm:h-[85vh] md:h-[80vh] flex flex-col relative z-10 shadow-[0_10px_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Top subtle highlight */}
        <div className="absolute left-0 top-0 right-0 h-[2px] bg-gradient-to-r from-green/20 via-green/60 to-green/20" />

        {/* ── SECTION 1: HEADER ── */}
        <div className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex-1 mr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-heading font-black text-white leading-none">
                {sym}
              </span>
              {bucket && <StatusBadge label={bucket} />}
              {alphaContribution !== null && (
                <span className={`text-caption font-mono ${alphaContribution >= 0 ? 'text-green' : 'text-red'}`}>
                  {alphaContribution >= 0 ? '+' : ''}{(alphaContribution * 100).toFixed(1)}pp
                </span>
              )}
            </div>
            <div className="text-caption text-zinc-500 mt-0.5 font-semibold truncate">{name}</div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-meta text-zinc-500 font-bold uppercase">LTP</div>
              <div className="font-mono text-sm font-black text-white">
                {holding?.ltp ? fR(holding.ltp) : '—'}
              </div>
            </div>
            {holding?.pnlPct !== undefined && (
              <div className="text-right">
                <div className="text-meta text-zinc-500 font-bold uppercase">P&L</div>
                <div className={`font-mono text-sm font-black ${holding.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                  {fP(holding.pnlPct)}
                </div>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/2 hover:bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-4 sm:p-6 space-y-6 sm:space-y-8">

          {/* ── NEXT MOVE: the one synthesized call ── */}
          {nextMove && (
            <div className={`rounded-xl border p-3 flex items-start gap-3 ${VERDICT_BADGE[nextMove.tone]}`}>
              <div className="shrink-0 text-center">
                <div className="text-nano uppercase tracking-wider opacity-60">Next move</div>
                <div className="text-base font-black uppercase leading-tight">{nextMove.call}</div>
              </div>
              <p className="text-caption leading-relaxed opacity-90 border-l border-current/20 pl-3">{nextMove.reason}</p>
            </div>
          )}

          {/* ── GUARDRAIL: rearview interception at the decision point ── */}
          {guardrail && (guardrail.live || guardrail.history) && (
            <div className={`rounded-xl border p-3 space-y-2 ${
              guardrail.live?.severity === 'red'   ? 'border-red/30 bg-red/5' :
              guardrail.live?.severity === 'green' ? 'border-green/20 bg-green/5' :
              guardrail.live?.severity === 'amber' ? 'border-amber/25 bg-amber/5' :
              'border-white/10 bg-white/3'
            }`}>
              {guardrail.live && (
                <div>
                  <div className={`text-meta font-black uppercase tracking-wider flex items-center gap-1.5 ${
                    guardrail.live.severity === 'red' ? 'text-red' :
                    guardrail.live.severity === 'green' ? 'text-green' : 'text-amber'
                  }`}>
                    🛡 {guardrail.live.title}
                  </div>
                  <p className="text-caption text-zinc-300 leading-relaxed mt-1">{guardrail.live.message}</p>
                </div>
              )}
              {guardrail.history && (
                <div className={`text-micro font-mono text-zinc-400 ${guardrail.live ? 'border-t border-white/5 pt-2' : ''}`}>
                  <span className="text-zinc-500 uppercase tracking-wider">Your tape · </span>
                  {guardrail.history.trips}× round-trips ·{' '}
                  <span className={guardrail.history.winRate >= 50 ? 'text-green' : 'text-amber'}>{guardrail.history.winRate}% win</span> ·{' '}
                  <span className={guardrail.history.pnl >= 0 ? 'text-green' : 'text-red'}>
                    {guardrail.history.pnl >= 0 ? '+' : ''}₹{(Math.abs(guardrail.history.pnl) / 1e5).toFixed(2)}L realized
                  </span>
                  {guardrail.history.trips >= 20 && <span className="text-amber"> · overtraded</span>}
                </div>
              )}
            </div>
          )}

          {/* ── FUNDAMENTALS TEARSHEET (Screener 10yr teardown) ── */}
          {fundamentals && (() => {
            const cp = fundamentals.computed || null
            const g = fundamentals.grade || '—'                       // analyst hand grade
            const mg = cp?.grade || null                              // machine computed grade
            const gtone = x => /^A/.test(x) ? 'text-green border-green/30 bg-green/10'
              : /^B/.test(x) ? 'text-teal border-teal/30 bg-teal/10'
              : /^C/.test(x) ? 'text-amber border-amber/30 bg-amber/10'
              : 'text-red border-red/30 bg-red/10'
            const chipTone = t => t === 'g' ? 'text-green bg-green/10 border-green/20'
              : t === 'b' ? 'text-red bg-red/10 border-red/20'
              : 'text-zinc-400 bg-white/5 border-white/10'
            // prefer the machine's hard-data flags/metrics; fall back to curated
            const metrics  = cp?.metrics?.length  ? cp.metrics  : (fundamentals.metrics  || [])
            const redFlags = cp?.redFlags?.length ? cp.redFlags : (fundamentals.redFlags || [])
            const snap = cp?.snapshot || null
            const hasHand = g !== '—' || !!fundamentals.verdict
            const diverge = mg && g !== '—' && mg.charAt(0) !== g.charAt(0)
            const fin = cp?.sector === 'financial'
            const verdict = fundamentals.verdict
              || (cp ? `Machine grade ${mg} (${cp.score}/100)${redFlags.length ? ` — ${redFlags.length} red flag${redFlags.length > 1 ? 's' : ''}` : ' — no red flags'}. No analyst overlay yet.` : '')
            return (
              <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-meta uppercase tracking-wider text-zinc-500">Fundamentals · Screener 10yr</div>
                    <p className="text-caption text-zinc-300 leading-relaxed mt-1">{verdict}</p>
                  </div>
                  <div className="shrink-0 flex items-stretch gap-2">
                    {mg && (
                      <div className={`text-center rounded-lg border px-3 py-1.5 ${gtone(mg)}`}>
                        <div className="text-nano uppercase tracking-wider opacity-70">Machine</div>
                        <div className="text-heading font-black leading-none">{mg}</div>
                        <div className="text-nano opacity-60 font-mono">{cp.score}</div>
                      </div>
                    )}
                    {hasHand && (
                      <div className={`text-center rounded-lg border px-3 py-1.5 ${gtone(g)}`}>
                        <div className="text-nano uppercase tracking-wider opacity-70">Analyst</div>
                        <div className="text-heading font-black leading-none">{g}</div>
                      </div>
                    )}
                  </div>
                </div>
                {snap && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro font-mono text-zinc-400 border-y border-white/5 py-1.5">
                    {snap.pe != null && <span>P/E <span className="text-zinc-200">{snap.pe}</span></span>}
                    {!fin && snap.roce != null && <span>ROCE <span className="text-zinc-200">{snap.roce}%</span></span>}
                    {snap.roe != null && <span>ROE <span className="text-zinc-200">{snap.roe}%</span></span>}
                    {snap.promoter != null && <span>Promoter <span className="text-zinc-200">{snap.promoter}%</span></span>}
                    {snap.pledge > 0 && <span>Pledge <span className="text-red">{snap.pledge}%</span></span>}
                  </div>
                )}
                {metrics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {metrics.map((mc, i) => (
                      <span key={i} className={`text-micro font-mono px-2 py-0.5 rounded border ${chipTone(mc.tone)}`}>{mc.label}</span>
                    ))}
                  </div>
                )}
                {/* Last 4 quarters — the forensic trail (sales / PAT / OPM + YoY) */}
                {(() => {
                  const q = cp?.quarterly
                  if (!q?.netProfit || q.netProfit.length < 4) return null
                  const n = q.labels.length
                  const last4 = i => ({ label: q.labels[n - 4 + i], s: q.sales?.[n - 4 + i], p: q.netProfit[n - 4 + i], m: q.opmPct?.[n - 4 + i] })
                  const yoy = (arr) => (arr && arr.length >= 5 && arr[n - 5]) ? (arr[n - 1] - arr[n - 5]) / Math.abs(arr[n - 5]) : null
                  const py = yoy(q.netProfit), sy = yoy(q.sales)
                  const yCls = v => v == null ? 'text-zinc-600' : v > 0 ? 'text-green' : 'text-red'
                  const fmtY = v => v == null ? '' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`
                  return (
                    <div className="pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-nano uppercase tracking-wider text-zinc-600 font-black">Last 4 quarters · ₹cr</span>
                        <span className="text-nano font-mono">
                          {sy != null && <>Sales YoY <span className={yCls(sy)}>{fmtY(sy)}</span> · </>}
                          {py != null && <>PAT YoY <span className={yCls(py)}>{fmtY(py)}</span></>}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0, 1, 2, 3].map(i => {
                          const c = last4(i)
                          return (
                            <div key={i} className="rounded border border-white/5 bg-white/2 px-1.5 py-1 font-mono text-center">
                              <div className="text-nano text-zinc-600">{c.label}</div>
                              <div className="text-micro text-zinc-300 font-bold">{c.p ?? '—'}</div>
                              <div className="text-nano text-zinc-600">{c.s ?? '—'}{c.m != null ? ` · ${c.m}%` : ''}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
                {redFlags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5">
                    <span className="text-nano uppercase tracking-wider text-red font-black">⚑ Red flags</span>
                    {redFlags.map((rf, i) => (
                      <span key={i} className="text-micro text-red/90 font-mono">{rf}{i < redFlags.length - 1 ? ' ·' : ''}</span>
                    ))}
                  </div>
                )}
                {diverge && (
                  <p className="text-nano text-zinc-500 leading-snug">
                    Machine grade <span className={gtone(mg).split(' ')[0]}>{mg}</span> diverges from analyst <span className={gtone(g).split(' ')[0]}>{g}</span> — the analyst call rests on factors beyond the printed numbers{fin ? ' (e.g. NBFC asset quality the scrape can’t see)' : ''}.
                  </p>
                )}
                {/* THE ALPHA MODEL — the proprietary machine view (see ALPHA_MODEL.md) */}
                {(() => {
                  const am = alphaModel({
                    fundamentals, technicals, ltp: holding?.ltp, theme: holding?.theme,
                    auditSeverity: aiInsights?.earningsAudit?.stocks?.[sym]?.severity,
                    sectorRotation: aiInsights?.sectorRotation,
                  })
                  if (!am) return null
                  const vCls = am.tier === 'STRONG' ? 'text-green border-green/30 bg-green/10'
                    : am.tier === 'NEGATIVE' ? 'text-red border-red/30 bg-red/10'
                    : am.tier === 'POSITIVE' ? 'text-teal border-teal/30 bg-teal/10'
                    : 'text-amber border-amber/30 bg-amber/10'
                  return (
                    <div className="flex items-start gap-2 pt-2 border-t border-white/5">
                      <span className={`shrink-0 text-center rounded border px-1.5 py-0.5 ${vCls}`}>
                        <span className="block text-nano font-black uppercase tracking-wide">α {am.score}</span>
                        <span className="block text-nano font-black uppercase tracking-wide opacity-80">{am.tier}</span>
                      </span>
                      <div className="min-w-0">
                        <span className="text-micro font-mono text-zinc-400">
                          Alpha model · Q {am.sleeves.Q ?? '—'} · M {am.sleeves.M ?? '—'} · G {am.sleeves.G ?? '—'} · V {am.sleeves.V ?? '—'} · S {am.sleeves.S}
                          <span className="text-zinc-600"> · driver {am.driver} · risk {am.risk}</span>
                        </span>
                        <p className="text-nano text-zinc-500 leading-snug mt-0.5">{am.reason} Fresh-money call: <span className="text-zinc-300 font-bold">{am.verdict}</span>.</p>
                      </div>
                    </div>
                  )
                })()}
                {/* Earnings quality audit — forensic read of the decade series */}
                {(() => {
                  const au = aiInsights?.earningsAudit?.stocks?.[sym]
                  if (!au) return null
                  const aCls = au.severity === 'RED' ? 'text-red border-red/30 bg-red/10'
                    : au.severity === 'CLEAN' ? 'text-green border-green/30 bg-green/10'
                    : 'text-amber border-amber/30 bg-amber/10'
                  return (
                    <div className="flex items-start gap-2 pt-2 border-t border-white/5">
                      <span className={`shrink-0 text-nano font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${aCls}`}>{au.severity}</span>
                      <div className="min-w-0">
                        <span className="text-micro font-mono text-zinc-400">Earnings audit{au.issues.length > 0 && <span className="text-zinc-600"> · {au.issues.join(' · ')}</span>}</span>
                        <p className="text-nano text-zinc-500 leading-snug mt-0.5">{au.read}</p>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Core Intelligence */}
            <div className="space-y-6">

              {/* ── SECTION 2: THESIS ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Investment Thesis
                  </div>
                  <div className="flex items-center gap-3">
                    {aiStock?.conviction != null && holding?.conv != null && holding.conv <= aiStock.conviction - 1 && (
                      <span className="text-nano font-black font-mono border border-amber/25 bg-amber/10 text-amber px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Pre-teardown
                      </span>
                    )}
                    {thesisAgeDays !== null && (
                      <span className={`text-nano font-black font-mono border px-1.5 py-0.5 rounded ${
                        thesisNeedsRefresh ? 'text-amber bg-amber/10 border-amber/25' : 'text-zinc-500 bg-white/5 border-white/5'
                      }`}>
                        {thesisAgeDays} Days Old
                      </span>
                    )}
                    {!isEditingThesis && (
                      <button
                        onClick={() => setIsEditingThesis(true)}
                        className="text-micro text-green hover:underline uppercase tracking-wider font-black cursor-pointer"
                      >
                        [Edit]
                      </button>
                    )}
                  </div>
                </div>

                {isEditingThesis ? (
                  <form onSubmit={handleThesisSubmit} className="space-y-3 pt-1">
                    <textarea
                      required
                      value={thesisText}
                      onChange={e => { setThesisText(e.target.value); setError('') }}
                      rows={4}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-body text-white placeholder-zinc-600 focus:outline-none focus:border-green transition-colors resize-none leading-relaxed font-sans"
                    />
                    {error && <div className="text-micro text-red">{error}</div>}
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsEditingThesis(false)}
                        className="px-3 py-1.5 rounded-lg border border-white/10 bg-transparent text-zinc-400 font-bold text-micro uppercase tracking-wider cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-green text-white font-bold text-micro uppercase tracking-wider cursor-pointer"
                      >
                        Save Thesis
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2 pt-1">
                    <div className="italic text-zinc-300 pl-3 border-l-2 border-white/10 leading-relaxed font-sans">
                      {dossier?.thesisEntries?.[0] ? (
                        <>
                          <p className={isExpandingThesis ? '' : 'line-clamp-4'}>
                            "{stripMd(dossier.thesisEntries[0].thesis)}"
                          </p>
                          {dossier.thesisEntries[0].thesis.length > 200 && (
                            <button
                              onClick={() => setIsExpandingThesis(!isExpandingThesis)}
                              className="text-micro text-zinc-500 hover:text-white uppercase tracking-wider font-mono block mt-1 cursor-pointer"
                            >
                              {isExpandingThesis ? 'Show less' : 'Read more'}
                            </button>
                          )}
                        </>
                      ) : brain?.thesis ? (
                        <>
                          <p className={isExpandingThesis ? '' : 'line-clamp-4'}>
                            "{stripMd(brain.thesis)}"
                          </p>
                          {brain.thesis.length > 200 && (
                            <button
                              onClick={() => setIsExpandingThesis(!isExpandingThesis)}
                              className="text-micro text-zinc-500 hover:text-white uppercase tracking-wider font-mono block mt-1 cursor-pointer"
                            >
                              {isExpandingThesis ? 'Show less' : 'Read more'}
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="text-zinc-600 font-mono text-caption">No core thesis logged yet.</p>
                      )}
                    </div>
                    {thesisEntries?.[0]?.convAtEntry && (
                      <div className="text-caption text-zinc-500 font-mono pl-3">
                        Entered at conviction: <strong className="text-white">{thesisEntries[0].convAtEntry}/10</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── SECTION 3: CONVICTION BREAKDOWN (10-dim bars) ── */}
              <div className="space-y-3 border-t border-white/5 pt-6">
                <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2">
                  <BarChart2 className="w-3.5 h-3.5" /> Thesis Dimensions <span className="text-zinc-600 normal-case font-normal">· qualitative — see Fundamentals for the hard read</span>
                </div>
                {hasBrainDimensions ? (
                  <div className="h-[220px] sm:h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
                        <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]}
                          tick={{ fill: '#52525B', fontSize: 9, fontFamily: 'IBM Plex Mono' }} />
                        <YAxis type="category" dataKey="name" width={100}
                          tick={{ fill: '#71717A', fontSize: 9, fontFamily: 'IBM Plex Mono', fontWeight: 600 }}
                          tickFormatter={(v) => v.replace(' Visibility', '').replace(' Protection', '').replace('Competitive ', '')} />
                        <Bar dataKey="value" radius={[0, 2, 2, 0]} maxBarSize={12}>
                          {barData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getBarColor(entry.rawValue)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-zinc-600 font-mono text-caption py-4">
                    Brain data not indexed for this stock. Update INVESTMENT_BRAIN.md and run build:brain-index.
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Historical & Market Intelligence */}
            <div className="space-y-6">

              {/* ── SECTION 4: CONVICTION TRAJECTORY ── */}
              <div className="space-y-3">
                <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2 border-b border-white/5 pb-2">
                  <TrendingUp className="w-3.5 h-3.5" /> Conviction Trajectory
                </div>
                {lineData.length >= 2 ? (
                  <div className="h-[110px] sm:h-[140px] pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineData} margin={{ left: -30, right: 10, top: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                        <XAxis dataKey="date" tick={{ fill: '#52525B', fontSize: 9, fontFamily: 'IBM Plex Mono' }} />
                        <YAxis domain={[0, 10]} ticks={[0, 5, 7, 10]} tick={{ fill: '#52525B', fontSize: 9, fontFamily: 'IBM Plex Mono' }} />
                        <ReferenceLine y={5} stroke="rgba(239, 68, 68, 0.2)" strokeDasharray="3 3" />
                        <ReferenceLine y={7} stroke="rgba(16, 185, 129, 0.2)" strokeDasharray="3 3" />
                        <Tooltip
                          content={({ payload }) => {
                            if (!payload?.[0]) return null
                            const d = payload[0].payload
                            return (
                              <div className="bg-[#050D18] border border-white/10 rounded-lg p-2 max-w-[200px] leading-snug">
                                <div className="text-caption text-zinc-400 font-mono font-bold">{d.date}</div>
                                <div className="text-micro text-white font-mono font-black mt-1">
                                  Shift: {d.from} → {d.score}
                                </div>
                                <p className="text-caption text-zinc-400 italic font-sans mt-0.5">"{d.reason}"</p>
                                {d.priceAtChange && <span className="text-nano text-zinc-500 font-mono">Price: ₹{d.priceAtChange}</span>}
                              </div>
                            )
                          }}
                        />
                        <Line type="monotone" dataKey="score" stroke="#10B981" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0, fill: '#10B981' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-2">
                    <span className="text-body font-mono text-zinc-500">Score: </span>
                    <span className="text-body font-mono font-black text-white">{holding?.conv ?? '—'}/10</span>
                    <span className="text-body font-mono text-zinc-600"> · No drift history logged</span>
                  </div>
                )}
              </div>

              {/* ── SECTION 5: AI READ ── */}
              <div className="space-y-3 border-t border-white/5 pt-6">
                <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2">
                  <BarChart2 className="w-3.5 h-3.5 text-zinc-400" /> Claude Strategic AI Verdict
                  <FreshnessChip asOf={aiStock?.asOf || aiStock?.lastUpdated} maxFresh={7} hint="ask Claude to 'run weekly insights'" />
                </div>
                {aiStock ? (
                  <div className="space-y-3">
                    {/* Reconciliation: flag when the fundamental re-score has superseded this older read */}
                    {(() => {
                      const cur = holding?.conv, ai = aiStock.conviction
                      if (cur == null || ai == null || cur > ai - 1) return null
                      return (
                        <div className="rounded-lg border border-amber/30 bg-amber/5 p-2.5 text-caption text-amber/90 leading-relaxed">
                          ⚠ Superseded — conviction cut to <span className="font-bold">{cur}</span>{fundamentals?.grade ? ` (Grade ${fundamentals.grade})` : ''} on the fundamental teardown. The read below predates it — treat the bullish framing with caution.
                        </div>
                      )
                    })()}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-500 font-mono text-nano">Verdict:</span>
                      <StatusBadge label={aiStock.verdict || aiStock.action || 'HOLD'} />
                      {aiStock.conviction != null && (
                        <span className="text-nano font-mono text-zinc-400 line-through opacity-60">Conv {aiStock.conviction}</span>
                      )}
                      {holding?.conv != null && holding.conv !== aiStock.conviction && (
                        <span className="text-nano font-mono text-amber">→ {holding.conv} now</span>
                      )}
                    </div>

                    {/* Thesis one-liner (new schema) */}
                    {aiStock.thesisOneLiner && (
                      <div className="text-body text-white leading-snug font-sans font-semibold border-l-2 border-green/40 pl-3">
                        {aiStock.thesisOneLiner}
                      </div>
                    )}

                    {/* Veteran Take (the new headline narrative) */}
                    {aiStock.veteranTake && (
                      <div className="text-body text-zinc-300 leading-relaxed italic font-sans bg-white/2 border border-white/5 rounded-lg px-3 py-2.5">
                        <div className="text-meta text-zinc-500 uppercase tracking-wider font-bold mb-1 not-italic">Veteran Take</div>
                        <p className={isExpandingAiSummary ? '' : 'line-clamp-4'}>
                          {aiStock.veteranTake}
                        </p>
                        {aiStock.veteranTake.length > 250 && (
                          <button
                            onClick={() => setIsExpandingAiSummary(!isExpandingAiSummary)}
                            className="text-micro text-zinc-500 hover:text-white uppercase tracking-wider font-mono block mt-1 cursor-pointer not-italic"
                          >
                            {isExpandingAiSummary ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Fallback summary if no veteran take */}
                    {!aiStock.veteranTake && aiStock.summary && (
                      <div className="text-body text-zinc-300 leading-relaxed italic font-sans">
                        <p className={isExpandingAiSummary ? '' : 'line-clamp-3'}>
                          "{aiStock.summary}"
                        </p>
                        {aiStock.summary.length > 150 && (
                          <button
                            onClick={() => setIsExpandingAiSummary(!isExpandingAiSummary)}
                            className="text-micro text-zinc-500 hover:text-white uppercase tracking-wider font-mono block mt-1 cursor-pointer"
                          >
                            {isExpandingAiSummary ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Action call — the hard recommendation */}
                    {aiStock.actionCall && (
                      <div className="text-caption text-green bg-green/5 border border-green/20 rounded-lg px-3 py-2 leading-relaxed">
                        <strong className="text-meta text-green block mb-0.5 uppercase tracking-wider">Action Call</strong>
                        <span className="text-zinc-200">{aiStock.actionCall}</span>
                      </div>
                    )}

                    {/* Bull / Bear case grid (new schema) */}
                    {(Array.isArray(aiStock.bullCase) && aiStock.bullCase.length > 0) || (Array.isArray(aiStock.bearCase) && aiStock.bearCase.length > 0) ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                        {Array.isArray(aiStock.bullCase) && aiStock.bullCase.length > 0 && (
                          <div className="bg-green/5 border border-green/15 rounded-lg p-2.5">
                            <div className="text-meta text-green uppercase tracking-wider font-bold mb-1.5">Bull Case</div>
                            <ul className="space-y-1 text-caption text-zinc-300 leading-snug list-disc list-inside marker:text-green/60">
                              {aiStock.bullCase.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(aiStock.bearCase) && aiStock.bearCase.length > 0 && (
                          <div className="bg-red/5 border border-red/15 rounded-lg p-2.5">
                            <div className="text-meta text-red uppercase tracking-wider font-bold mb-1.5">Bear Case</div>
                            <ul className="space-y-1 text-caption text-zinc-300 leading-snug list-disc list-inside marker:text-red/60">
                              {aiStock.bearCase.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Valuation + position sizing row */}
                    {(aiStock.valuation || aiStock.positionSizing) && (
                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        {aiStock.valuation?.lens && (
                          <div className="bg-white/2 border border-white/5 rounded-lg p-2.5">
                            <div className="text-nano text-zinc-500 uppercase tracking-wider font-bold mb-1">Valuation</div>
                            <div className="text-caption text-zinc-300 leading-snug">{aiStock.valuation.lens}</div>
                            {aiStock.valuation.premiumDiscount && (
                              <div className="text-nano text-zinc-500 font-mono mt-1">vs sector: {aiStock.valuation.premiumDiscount}</div>
                            )}
                          </div>
                        )}
                        {aiStock.positionSizing?.sizingAction && (
                          <div className="bg-white/2 border border-white/5 rounded-lg p-2.5">
                            <div className="text-nano text-zinc-500 uppercase tracking-wider font-bold mb-1">Sizing</div>
                            <div className="text-caption text-zinc-300 leading-snug font-bold">{aiStock.positionSizing.sizingAction}</div>
                            {aiStock.positionSizing.gapValue != null && (
                              <div className="text-nano text-zinc-500 font-mono mt-1">
                                Gap: ₹{Math.abs(aiStock.positionSizing.gapValue).toLocaleString('en-IN')} {aiStock.positionSizing.gapValue < 0 ? 'over' : 'under'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Entry / Exit zones */}
                    {(aiStock.entryZone || aiStock.exitZone) && (
                      <div className="grid grid-cols-2 gap-2.5">
                        {aiStock.entryZone && (
                          <div className="text-caption text-zinc-300 bg-white/2 border border-white/5 rounded-lg px-2.5 py-1.5">
                            <span className="text-nano text-green uppercase font-bold tracking-wider mr-1.5">Entry</span>
                            <span className="font-mono">{aiStock.entryZone}</span>
                          </div>
                        )}
                        {aiStock.exitZone && (
                          <div className="text-caption text-zinc-300 bg-white/2 border border-white/5 rounded-lg px-2.5 py-1.5">
                            <span className="text-nano text-red uppercase font-bold tracking-wider mr-1.5">Exit</span>
                            <span className="font-mono">{aiStock.exitZone}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* What changes thesis */}
                    {aiStock.whatChangesThesis && (
                      <div className="text-caption text-amber bg-amber/5 border border-amber/15 rounded-lg px-3 py-2 leading-relaxed">
                        <strong className="text-meta text-amber block mb-0.5 uppercase tracking-wider">What Changes Thesis</strong>
                        <span className="text-zinc-300">{aiStock.whatChangesThesis}</span>
                      </div>
                    )}

                    {/* Peer check */}
                    {aiStock.peerCheck?.peer && aiStock.peerCheck.delta && (
                      <div className="text-caption text-zinc-300 bg-white/2 border border-white/5 rounded-lg px-3 py-2 leading-relaxed">
                        <strong className="text-meta text-purple block mb-0.5 uppercase tracking-wider">Peer Check · {aiStock.peerCheck.peer}</strong>
                        <span>{aiStock.peerCheck.delta}</span>
                      </div>
                    )}

                    {/* Legacy keyRisk (fallback, only if no whatChangesThesis) */}
                    {!aiStock.whatChangesThesis && aiStock.keyRisk && (
                      <div className="text-caption text-amber bg-amber/5 border border-amber/15 rounded-lg px-3 py-2 flex items-start gap-2 leading-relaxed">
                        <span className="shrink-0 text-amber mt-0.5">⚠</span>
                        <div>
                          <strong className="text-meta text-amber block mb-0.5">Primary Risk</strong>
                          <span>{aiStock.keyRisk}</span>
                        </div>
                      </div>
                    )}

                    {/* Pre-Results Brief — binary event watch guide */}
                    {aiStock.preResultsBrief && (
                      <div className="rounded-xl border border-amber/30 bg-amber/5 p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-nano text-amber uppercase tracking-wider font-black flex items-center gap-1.5">
                            ⚡ Pre-Results Watch
                          </div>
                          <div className="font-mono text-nano text-amber shrink-0">
                            {aiStock.preResultsBrief.resultsDate}
                            {aiStock.preResultsBrief.daysAway != null && (
                              <span className="ml-1.5 text-amber/70">({aiStock.preResultsBrief.daysAway}d)</span>
                            )}
                          </div>
                        </div>

                        {aiStock.preResultsBrief.currentPosition && (
                          <div className="text-nano font-mono text-zinc-400 leading-relaxed">
                            {aiStock.preResultsBrief.currentPosition}
                          </div>
                        )}

                        {aiStock.preResultsBrief.whatToWatch?.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-nano text-zinc-500 uppercase tracking-wider font-bold">Watch for</div>
                            {aiStock.preResultsBrief.whatToWatch.map((w, i) => (
                              <div key={i} className="text-nano font-mono text-zinc-300 flex gap-1.5 leading-relaxed">
                                <span className="text-amber shrink-0 mt-0.5">·</span>
                                <span>{w}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {aiStock.preResultsBrief.bullPrint && (
                            <div className="rounded-lg border border-green/20 bg-green/5 p-2.5 space-y-1">
                              <div className="text-nano text-green font-black uppercase tracking-wider">Bull Print</div>
                              <div className="text-nano font-mono text-zinc-300 leading-relaxed">{aiStock.preResultsBrief.bullPrint.criteria}</div>
                              <div className="text-nano font-mono text-green/80 leading-relaxed">{aiStock.preResultsBrief.bullPrint.sizingDecision}</div>
                            </div>
                          )}
                          {aiStock.preResultsBrief.bearPrint && (
                            <div className="rounded-lg border border-red/20 bg-red/5 p-2.5 space-y-1">
                              <div className="text-nano text-red font-black uppercase tracking-wider">Bear Print</div>
                              <div className="text-nano font-mono text-zinc-300 leading-relaxed">{aiStock.preResultsBrief.bearPrint.criteria}</div>
                              <div className="text-nano font-mono text-red/80 leading-relaxed">{aiStock.preResultsBrief.bearPrint.sizingDecision}</div>
                            </div>
                          )}
                        </div>

                        {aiStock.preResultsBrief.decision && (
                          <div className="text-nano font-mono text-zinc-400 border-t border-white/5 pt-2 leading-relaxed">
                            <span className="text-amber font-black">Decision: </span>
                            {aiStock.preResultsBrief.decision}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Catalysts — handle both legacy (string[]) and new ({date,event,impact,expected}[]) */}
                    {aiStock.catalysts?.length > 0 && (
                      <div className="pt-1.5 space-y-1.5">
                        <div className="text-nano text-zinc-500 uppercase tracking-wider font-bold">Catalysts</div>
                        <div className="flex flex-wrap gap-1.5">
                          {aiStock.catalysts.map((c, idx) => {
                            if (typeof c === 'string') {
                              return (
                                <span key={idx} className="text-nano font-mono rounded-full border border-zinc-700 text-zinc-400 px-2.5 py-0.5 bg-black/20">
                                  {c}
                                </span>
                              )
                            }
                            return (
                              <span key={idx} className="text-nano font-mono rounded border border-zinc-700 text-zinc-300 px-2 py-0.5 bg-black/20">
                                <span className="text-zinc-500">{c.date}</span>
                                <span className="mx-1.5">·</span>
                                <span>{c.event}</span>
                                {c.impact && <span className="ml-1.5 text-amber">[{c.impact}]</span>}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-zinc-600 font-mono text-caption">
                    AI read not generated yet — run `npm run insights:weekly`.
                  </div>
                )}
              </div>

              {/* ── SECTION 6: TECHNICALS ── */}
              <div className="space-y-4 border-t border-white/5 pt-6">
                <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" /> Technical Indicators
                  <FreshnessChip asOf={insightsData?.generatedAt} maxFresh={14} hint="run scripts/refresh-insights.js with Kite session" />
                </div>
                {technicals ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* RSI Gauge */}
                      <div className="bg-white/2 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                        <div className="text-meta text-zinc-500">RSI (14)</div>
                        <div className="flex items-baseline gap-2 mt-1.5">
                          <span className={`text-hero font-mono ${getRsiColor(technicals.rsi14)}`}>
                            {technicals.rsi14 !== null ? technicals.rsi14.toFixed(1) : '—'}
                          </span>
                          <span className="text-caption text-zinc-500 font-mono">
                            {technicals.rsi14 >= 70 ? 'Overbought' : technicals.rsi14 <= 30 ? 'Oversold' : 'Neutral'}
                          </span>
                        </div>
                        {/* Gauge visual */}
                        <div className="w-full bg-white/5 h-[4px] rounded-full overflow-hidden mt-2 relative">
                          <div className="h-full rounded-full bg-green" style={{ width: `${technicals.rsi14 ?? 50}%` }} />
                        </div>
                      </div>

                      {/* SMA Levels */}
                      <div className="bg-white/2 border border-white/5 rounded-xl p-3 space-y-2">
                        <div className="text-meta text-zinc-500">Moving Averages</div>
                        <div className="space-y-1 font-mono text-caption font-bold">
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">50 SMA</span>
                            <span className={holding?.ltp && technicals.sma50 ? (holding.ltp >= technicals.sma50 ? 'text-green' : 'text-red') : 'text-zinc-500'}>
                              {holding?.ltp && technicals.sma50 ? (holding.ltp >= technicals.sma50 ? 'ABOVE' : 'BELOW') : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">200 SMA</span>
                            <span className={holding?.ltp && technicals.sma200 ? (holding.ltp >= technicals.sma200 ? 'text-green' : 'text-red') : 'text-zinc-500'}>
                              {holding?.ltp && technicals.sma200 ? (holding.ltp >= technicals.sma200 ? 'ABOVE' : 'BELOW') : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 52-Week Range */}
                    {technicals.low52w && technicals.high52w && holding?.ltp && (
                      <div className="bg-white/2 border border-white/5 rounded-xl p-3.5 space-y-2">
                        <div className="flex justify-between items-baseline">
                          <span className="text-meta text-zinc-500">52-Week Range</span>
                          {rangePct !== null && (
                            <span className="text-meta font-mono font-black text-white">
                              At {rangePct.toFixed(0)}th percentile
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-nano text-zinc-500">
                          <span>{fR(technicals.low52w)}</span>
                          <div className="flex-1 bg-white/5 h-[4px] rounded-full relative">
                            {rangePct !== null && (
                              <div className="absolute w-2 h-2 rounded-full bg-green -top-0.5" style={{ left: `calc(${rangePct}% - 4px)` }} />
                            )}
                          </div>
                          <span>{fR(technicals.high52w)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-zinc-600 font-mono text-caption">
                    Technicals not available — run `node scripts/refresh-insights.js` with Kite session token.
                  </div>
                )}
              </div>

            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-white/5 pt-6">
            {/* ── SECTION 7: FILINGS + CATALYSTS ── */}
            <div className="space-y-3">
              <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2">
                <Newspaper className="w-3.5 h-3.5" /> Filings & Upcoming Catalysts
              </div>
              {filings.length > 0 || catalysts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Exchange Filings (Max 5) */}
                  <div className="space-y-2.5">
                    <span className="text-meta text-zinc-600 font-bold block">Exchange Filings</span>
                    {filings.slice(0, 5).map((f, idx) => (
                      <div key={idx} className="bg-white/2 border border-white/5 rounded-lg p-2.5 space-y-1">
                        <div className="flex justify-between items-center text-micro text-zinc-500 font-mono">
                          <span>{f.date}</span>
                          {f.type && <span className="text-white">{f.type}</span>}
                        </div>
                        <p className="text-zinc-300 font-mono text-caption leading-snug truncate" title={f.title}>
                          {f.title.length > 55 ? `${f.title.slice(0, 55)}...` : f.title}
                        </p>
                      </div>
                    ))}
                    {filings.length === 0 && (
                      <span className="text-zinc-600 font-mono text-caption block py-2">No exchange filings indexed.</span>
                    )}
                  </div>

                  {/* Upcoming Catalysts */}
                  <div className="space-y-2.5">
                    <span className="text-meta text-zinc-600 font-bold block">Expected Catalysts</span>
                    {catalysts.map((c, idx) => (
                      <div key={idx} className="bg-white/2 border border-white/5 rounded-lg p-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-caption text-zinc-400 font-mono font-bold block mb-0.5">{c.date}</span>
                          <span className="text-caption text-white leading-snug block">{c.event}</span>
                          {c.portfolioAction && (
                            <span className="text-micro text-amber italic block mt-0.5">Play: {c.portfolioAction}</span>
                          )}
                        </div>
                        {c.risk && <StatusBadge label={c.risk} />}
                      </div>
                    ))}
                    {catalysts.length === 0 && (
                      <span className="text-zinc-600 font-mono text-caption block py-2">No immediate catalysts detected.</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-zinc-600 font-mono text-caption py-2">
                  No listings found.
                </div>
              )}
            </div>

            {/* ── SECTION 8: PEERS ── */}
            <div className="space-y-3">
              <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Peer Context Table {holding?.theme ? `(${holding.theme})` : ''}
              </div>
              {peers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-meta font-mono">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500">
                        <th className="py-2 text-left">Symbol</th>
                        <th className="py-2">Bucket</th>
                        <th className="py-2 text-right">Conv</th>
                        <th className="py-2 text-right">P&L%</th>
                        <th className="py-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/2">
                      {/* Current row */}
                      {holding && (
                        <tr className="bg-white/5 font-black text-white">
                          <td className="py-2 text-left font-black">{sym}*</td>
                          <td className="py-2"><StatusBadge label={bucket} /></td>
                          <td className="py-2 text-right font-black">{holding.conv}/10</td>
                          <td className={`py-2 text-right font-black ${holding.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                            {fP(holding.pnlPct)}
                          </td>
                          <td className="py-2 text-right font-black">{fL(holding.value)}</td>
                        </tr>
                      )}
                      {/* Peer rows */}
                      {peers.map(p => (
                        <tr key={p.sym} className="text-zinc-400">
                          <td className="py-2 text-left">{p.sym}</td>
                          <td className="py-2"><StatusBadge label={p.bucket} /></td>
                          <td className="py-2 text-right">{p.conv}/10</td>
                          <td className={`py-2 text-right ${p.pnlPct >= 0 ? 'text-green' : 'text-red'}`}>
                            {fP(p.pnlPct)}
                          </td>
                          <td className="py-2 text-right">{fL(p.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-zinc-600 font-mono text-caption py-4">
                  No same-theme holdings found in portfolio.
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 9: RECENT NEWS ── */}
          {news && (news.headlines.length > 0 || news.ratingSignals.length > 0) && (
            <div className="space-y-3 border-t border-white/5 pt-6">
              <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2">
                <Newspaper className="w-3.5 h-3.5" /> Recent News
                <span className="text-nano text-zinc-600 normal-case font-normal">auto · Google News 30d</span>
              </div>

              {news.ratingSignals.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {news.ratingSignals.map((r, idx) => (
                    <span key={idx} className="text-nano font-mono rounded border border-purple/25 bg-purple/10 text-purple px-2 py-0.5">
                      {r.broker ? `${r.broker} · ` : ''}{r.target ? `₹${r.target}` : 'rating'}
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                {news.headlines.map((h, idx) => (
                  <a
                    key={idx}
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 bg-white/2 hover:bg-white/5 border border-white/5 rounded-lg p-2.5 transition-colors cursor-pointer"
                  >
                    <span className={`text-nano font-mono uppercase tracking-wider shrink-0 mt-0.5 w-12 ${
                      h.type === 'results' ? 'text-amber' :
                      h.type === 'rating'  ? 'text-purple' :
                      h.type === 'order'   ? 'text-green' : 'text-zinc-600'
                    }`}>{h.type}</span>
                    <div className="min-w-0">
                      <p className="text-caption text-zinc-300 leading-snug">{h.title}</p>
                      <span className="text-nano text-zinc-600 font-mono">{h.date} · {h.source}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── FOOTER: HISTORICAL TIMELINE & REFLECTION LOGS ── */}
          <div className="border-t border-white/5 pt-10 flex flex-col md:flex-row md:items-baseline md:justify-between gap-6 shrink-0 text-meta">
            <div className="space-y-2">
              <span className="text-zinc-500 font-bold uppercase block">Thesis History Log</span>
              {thesisEntries.length > 0 ? (
                <div className="space-y-1 text-zinc-400 font-mono text-caption">
                  {thesisEntries.map((t, idx) => (
                    <div key={t.id || idx} className="flex gap-3">
                      <span className="text-zinc-500 w-16 shrink-0">{t.date}</span>
                      <span>
                        Conv {t.convAtEntry ?? '—'} ·{' '}
                        {t.verdict ? (
                          <span className={t.verdict === 'VALIDATED' ? 'text-green' : 'text-red'}>{t.verdict}</span>
                        ) : (
                          'Active'
                        )}
                        {t.filledQty && ` · Buy ${fN(t.filledQty)} sh @ ₹${fR(t.filledPrice)}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-zinc-600 font-mono text-caption block">No past ledger logs.</span>
              )}
            </div>

            {/* Reflections alert log trigger */}
            {holding && thesisAgeDays !== null && (thesisAgeDays >= 30 || thesisAgeDays >= 90) && (
              <div className="bg-amber/5 border border-amber/20 rounded-lg p-3 text-right">
                <span className="text-amber block font-bold mb-0.5">Thesis Reflection Checklist</span>
                <span className="text-zinc-400 font-mono block mb-2">Position age: {thesisAgeDays} days</span>
                {/* Note: user can tap to log reflection */}
                <button
                  type="button"
                  className="text-micro text-green hover:underline uppercase tracking-widest font-black cursor-pointer bg-white/2 border border-white/10 px-2 py-1 rounded"
                >
                  Log Reflection Trigger
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>,
    document.body
  )
}
