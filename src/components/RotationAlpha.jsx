import { useMemo } from 'react'
import { fL } from '../lib/format'
import { computeRotationAlpha, REGIME_META, MOMENTUM_META, SIGNAL_META } from '../lib/rotationAlpha'

function Bar({ leaderPct, neutralPct, laggardPct }) {
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
      <div style={{ width: `${(leaderPct * 100).toFixed(1)}%`, background: REGIME_META.LEADER.color }} />
      <div style={{ width: `${(neutralPct * 100).toFixed(1)}%`, background: REGIME_META.NEUTRAL.color }} />
      <div style={{ width: `${(laggardPct * 100).toFixed(1)}%`, background: REGIME_META.LAGGARD.color }} />
    </div>
  )
}

function StockChip({ r, onSelect }) {
  const sig = SIGNAL_META[r.signal]
  const mom = MOMENTUM_META[r.tier]
  return (
    <button
      onClick={() => onSelect?.(r.sym)}
      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/2 hover:bg-white/4 transition-colors cursor-pointer text-left"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono font-black text-white text-caption">{r.sym}</span>
        <span className="text-micro text-zinc-600 font-mono uppercase tracking-wide truncate hidden sm:inline">{r.theme}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 font-mono text-micro">
        <span className={mom.cls}>{mom.label}</span>
        {r.rsi != null && <span className="text-zinc-600">RSI {Math.round(r.rsi)}</span>}
        {r.gap > 0 && r.signal === 'FEED' && <span className="text-amber">{fL(r.gap)} room</span>}
        {r.signal === 'CULL' && r.conv != null && <span className="text-zinc-600">conv {r.conv}</span>}
        <span className={`font-black px-1.5 py-0.5 rounded border ${sig.cls}`}>{sig.label}</span>
      </div>
    </button>
  )
}

export default function RotationAlpha({ holdings, insightsData, onSelect }) {
  const ra = useMemo(() => computeRotationAlpha(holdings, insightsData), [holdings, insightsData])

  const alignPct = Math.round(ra.alignment * 100)
  const alignCls = ra.alignment >= 0.65 ? 'text-green' : ra.alignment >= 0.5 ? 'text-teal' : 'text-amber'

  return (
    <div className="space-y-3">
      {/* Headline alignment */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-micro uppercase tracking-wider text-zinc-500 font-mono">Rotation alignment</div>
          <div className={`text-hero font-black ${alignCls}`}>{alignPct}<span className="text-body text-zinc-600">/100</span></div>
        </div>
        <div className="text-right font-mono text-micro text-zinc-500 leading-relaxed">
          <div><span className="text-green font-black">{Math.round(ra.leaderPct * 100)}%</span> leaders · <span className="text-zinc-400">{fL(ra.leaderVal)}</span></div>
          <div><span className="text-red font-black">{Math.round(ra.laggardPct * 100)}%</span> laggards · <span className="text-zinc-400">{fL(ra.laggardVal)}</span></div>
        </div>
      </div>

      <Bar leaderPct={ra.leaderPct} neutralPct={ra.neutralPct} laggardPct={ra.laggardPct} />
      <div className="flex items-center gap-4 text-micro font-mono text-zinc-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: REGIME_META.LEADER.color }} />Leaders {Math.round(ra.leaderPct * 100)}%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: REGIME_META.NEUTRAL.color }} />Neutral {Math.round(ra.neutralPct * 100)}%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: REGIME_META.LAGGARD.color }} />Laggards {Math.round(ra.laggardPct * 100)}%</span>
      </div>

      <p className="text-meta text-text-dim leading-snug">
        Active capital only (Hedge / Cash / Satellites excluded). Capex · infra · defence · financials are leading; IT · FMCG · precious metals lagging.
        Lean capital toward leaders with momentum; starve fading laggards.
      </p>

      {/* FEED / CULL columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        <div className="space-y-1.5">
          <div className="text-micro uppercase tracking-wider font-black text-green font-mono flex items-center gap-2">
            Feed <span className="text-zinc-600">{ra.feed.length}</span>
          </div>
          {ra.feed.length === 0 && <div className="text-meta text-zinc-600 italic px-1">No underweight leaders with momentum.</div>}
          {ra.feed.map(r => <StockChip key={r.sym} r={r} onSelect={onSelect} />)}
        </div>
        <div className="space-y-1.5">
          <div className="text-micro uppercase tracking-wider font-black text-red font-mono flex items-center gap-2">
            Cull <span className="text-zinc-600">{ra.cull.length}</span>
          </div>
          {ra.cull.length === 0 && <div className="text-meta text-zinc-600 italic px-1">No fading laggards — clean book.</div>}
          {ra.cull.map(r => <StockChip key={r.sym} r={r} onSelect={onSelect} />)}
        </div>
      </div>
    </div>
  )
}
