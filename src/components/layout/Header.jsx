import { useState, useRef, useEffect } from 'react'
import { fL, fP } from '../../lib/format'

// ── Sync button with inline token popover ─────────────────────────────────────
function KiteSyncButton() {
  const [state,      setState]      = useState('idle') // idle | open | syncing | done | error
  const [token,      setToken]      = useState(() => sessionStorage.getItem('kite-token') || '')
  const [message,    setMessage]    = useState('')
  const popoverRef = useRef(null)

  // Close popover on outside click
  useEffect(() => {
    if (state !== 'open') return
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setState('idle')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [state])

  const doSync = async (accessToken) => {
    setState('syncing')
    try {
      const res  = await fetch('/api/kite-sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ accessToken }),
      })
      const data = await res.json()

      if (res.status === 401 || data.needsToken) {
        sessionStorage.removeItem('kite-token')
        setToken('')
        setState('open')
        setMessage(data.error || 'Token expired — paste a new one')
        return
      }
      if (!res.ok) {
        setState('error')
        setMessage(data.error || 'Sync failed')
        setTimeout(() => setState('idle'), 4000)
        return
      }

      sessionStorage.setItem('kite-token', accessToken)
      setState('done')
      setMessage(`✓ ${data.changed} updated · ${data.timestamp}`)
      setTimeout(() => setState('idle'), 5000)
    } catch (err) {
      setState('error')
      setMessage(err.message)
      setTimeout(() => setState('idle'), 4000)
    }
  }

  const handleClick = () => {
    if (state === 'syncing') return
    if (token) { doSync(token); return }
    setState(s => s === 'open' ? 'idle' : 'open')
  }

  const buttonLabel =
    state === 'syncing' ? '⟳ Syncing…' :
    state === 'done'    ? message :
    state === 'error'   ? '✗ Error' :
    '⟳ Sync with Kite'

  const buttonCls =
    state === 'done'  ? 'text-green border-green/20 bg-green/5' :
    state === 'error' ? 'text-red border-red/20 bg-red/5' :
    'text-text-sec hover:text-white hover:bg-white/10'

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={handleClick}
        disabled={state === 'syncing'}
        className={`text-meta bg-white/5 backdrop-blur-sm border border-white/10 px-2 py-0.5 rounded transition-all cursor-pointer uppercase tracking-wider flex items-center gap-1 hover:shadow-[0_0_8px_rgba(255,255,255,0.15)] disabled:cursor-not-allowed shrink-0 ${buttonCls}`}
      >
        <span className="sm:hidden">⟳</span>
        <span className="hidden sm:inline">{buttonLabel}</span>
      </button>

      {state === 'open' && (
        <div className="absolute top-full mt-2 left-0 z-[200] w-72 bg-[#0D1E35] border border-[#1A3050] rounded-xl shadow-2xl p-4 space-y-3">
          <div className="text-meta font-bold text-text-dim uppercase tracking-wider">Kite Access Token</div>
          {message && (
            <p className="text-meta text-amber leading-relaxed">{message}</p>
          )}
          <input
            autoFocus
            type="text"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste today's access token…"
            className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-text-dim focus:outline-none focus:border-zinc-700 transition-colors"
          />
          <p className="text-meta text-text-dim leading-relaxed">
            Get it from Kite developer console → "My Apps" → copy access token. Stored in session only.
          </p>
          <button
            onClick={() => { if (token.trim()) doSync(token.trim()) }}
            disabled={!token.trim()}
            className="w-full bg-zinc-800 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-bold py-2 rounded-lg cursor-pointer transition-all uppercase tracking-wider"
          >
            Sync Now
          </button>
        </div>
      )}
    </div>
  )
}

const TABS = [
  { id: 'cockpit',   label: 'Today' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'rebalance', label: 'Rebalance' },
  { id: 'invest',    label: 'Invest' },
  { id: 'screener',  label: 'Screener' },
  { id: 'rearview',  label: 'Rearview' },
]

const IDEAL_CORPUS = 10000000 // the reference corpus directional reference (not a hard target)

export default function Header({ totals, meta, tab, onTabChange, earningsCount = 0, discipline = null }) {
  const { totalVal, totalInv, totalPnL, totalROI } = totals
  const idealPct = Math.min((totalVal / IDEAL_CORPUS) * 100, 100)
  const audit = meta.refreshAudit
  const changedCount = audit?.changedSymbols?.length ?? 0
  const tabBarRef = useRef(null)

  // Keep the active tab on-screen on narrow viewports (5 tabs overflow mobile)
  useEffect(() => {
    const el = tabBarRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])
  const skippedCount = audit?.skippedSymbols?.length ?? 0

  // Price freshness — LTP/P&L are only as good as the last Kite sync
  const todayStr = new Date().toISOString().split('T')[0]
  const daysStale = meta.refreshDate
    ? Math.round((Date.now() - new Date(meta.refreshDate).getTime()) / 86400000)
    : 0
  const pricesStale = Boolean(meta.refreshDate && meta.refreshDate < todayStr && daysStale >= 1)

  return (
    <header className="bg-[#050D18] border-b border-white/5">

      {/* ── Compact single-row summary ── */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-7">
        <div className="flex items-center gap-3 py-3 flex-wrap">

          {/* Value + P&L */}
          <div className="flex items-baseline gap-2.5 shrink-0">
            <div className="font-mono text-xl md:text-2xl font-extrabold tracking-tight leading-none text-text-pri">
              {fL(totalVal)}
            </div>
            <div className={`text-meta font-mono font-bold px-2 py-0.5 rounded-full border ${
              totalPnL >= 0 ? 'text-green bg-green/10 border-green/20' : 'text-red bg-red/10 border-red/20'
            }`}>
              {totalPnL >= 0 ? '+' : ''}{fL(totalPnL)} {fP(totalROI)}
            </div>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/10 hidden sm:block" />

          {/* Inline metrics */}
          <div className="flex items-center gap-3 text-meta flex-wrap">
            <span className="text-text-dim">Invested <span className="text-text-sec font-mono font-bold">{fL(totalInv)}</span></span>
            <span className="text-text-dim hidden sm:inline">·</span>
            <span className="text-text-dim hidden sm:inline">vs the reference corpus ideal <span className="text-text-sec font-mono font-bold">{idealPct.toFixed(0)}%</span></span>
            <span className="text-text-dim hidden sm:inline">·</span>
            <span className="text-text-dim hidden sm:inline">Positions <span className="text-text-sec font-mono font-bold">{totals.positionCount}</span></span>
          </div>

          {/* Freshness + Sync — right-aligned */}
          <div className="ml-auto flex items-center gap-2.5 shrink-0">
            {pricesStale ? (
              <span className="text-meta font-bold text-amber">Prices {daysStale}d old</span>
            ) : (
              <span className="text-meta text-text-dim hidden sm:inline">Updated {meta.refreshDate}</span>
            )}
            <KiteSyncButton />
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="sticky top-0 z-[100] bg-[#050D18]/90 backdrop-blur-xl border-b border-white/5 shadow-lg">
      <div className="max-w-[1400px] mx-auto px-4 md:px-7">
        <div ref={tabBarRef} className="flex gap-0 -ml-4 pl-4 overflow-x-auto no-scrollbar mask-fade-right">
          {TABS.map(t => (
            <button key={t.id} onClick={() => onTabChange(t.id)} data-active={tab === t.id}
              className={`px-4 md:px-5 py-3 min-h-[44px] text-meta font-sans bg-transparent border-b-2 cursor-pointer uppercase tracking-tracked-10 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                tab === t.id
                  ? 'border-green text-green font-bold'
                  : 'border-transparent text-text-dim font-normal hover:text-text-sec'
              }`}
            >
              {t.label}
              {t.id === 'cockpit' && earningsCount > 0 && (
                <span className="inline-flex items-center justify-center bg-zinc-800 text-white text-meta leading-none h-3.5 min-w-[14px] px-0.5 rounded-full shadow-sm animate-pulse shadow-zinc-800">
                  {earningsCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      </div>
    </header>
  )
}
