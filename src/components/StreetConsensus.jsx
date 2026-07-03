import { useMemo } from 'react'
import streetData from '../data/street.json'
import { buildStreetFeed, getStreetView, IMPACT_META, CATALYST_ICON } from '../lib/street'

function FeedRow({ it, cmp, onSelect }) {
  const imp = IMPACT_META[it.impact] || IMPACT_META.LOW
  const icon = it.kind === 'RATING' ? '◈' : (CATALYST_ICON[it.type] || CATALYST_ICON.default)
  return (
    <button
      onClick={() => onSelect?.(it.sym)}
      className="w-full text-left flex items-start gap-3 py-2.5 hover:bg-white/2 transition-colors cursor-pointer group"
    >
      <span className="text-zinc-600 font-mono text-caption mt-0.5 shrink-0 w-4 text-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-black text-white text-caption">{it.sym}</span>
          {it.fresh && <span className="text-micro font-black text-green border border-green/30 bg-green/10 px-1.5 py-0.5 rounded font-mono">FRESH</span>}
          {it.upcoming && <span className="text-micro font-black text-teal border border-teal/30 bg-teal/10 px-1.5 py-0.5 rounded font-mono">UPCOMING</span>}
          <span className={`text-micro font-black px-1.5 py-0.5 rounded border font-mono ${imp.cls}`}>{it.kind === 'RATING' ? 'STREET' : it.type}</span>
          <span className="text-micro text-zinc-600 font-mono ml-auto shrink-0">
            {it.upcoming ? `in ${Math.abs(it.age)}d` : it.age === 0 ? 'today' : `${it.age}d ago`}
          </span>
        </div>
        <p className="text-caption text-zinc-400 leading-snug mt-0.5 group-hover:text-zinc-300 transition-colors">{it.headline}</p>
      </div>
    </button>
  )
}

export default function StreetConsensus({ holdings, onSelect }) {
  const heldSyms = useMemo(() => holdings?.map(h => h.sym) || [], [holdings])
  const ltpMap = useMemo(() => Object.fromEntries((holdings || []).map(h => [h.sym, h.ltp])), [holdings])

  const feed = useMemo(() => buildStreetFeed(streetData, heldSyms), [heldSyms])

  // Consensus TP upside table — names with broker coverage, ranked by upside
  const consensus = useMemo(() => {
    return heldSyms
      .map(sym => {
        const v = getStreetView(streetData, sym)
        if (!v?.consensusTP) return null
        const cmp = ltpMap[sym]
        const upside = cmp ? (v.consensusTP - cmp) / cmp : null
        return { sym, tp: v.consensusTP, rating: v.consensusRating, n: v.brokers.length, cmp, upside }
      })
      .filter(Boolean)
      .sort((a, b) => (b.upside ?? -1) - (a.upside ?? -1))
  }, [heldSyms, ltpMap])

  const freshCount = feed.filter(f => f.fresh).length

  return (
    <div className="space-y-4">
      {/* Consensus TP strip */}
      {consensus.length > 0 && (
        <div>
          <div className="text-micro uppercase tracking-wider text-zinc-500 font-mono mb-2">Street consensus TP · upside to target</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {consensus.map(c => (
              <button key={c.sym} onClick={() => onSelect?.(c.sym)}
                className="text-left px-2.5 py-2 rounded-lg border border-white/5 bg-white/2 hover:bg-white/4 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-black text-white text-caption">{c.sym}</span>
                  {c.upside != null && (
                    <span className={`font-mono font-black text-caption ${c.upside >= 0 ? 'text-green' : 'text-red'}`}>
                      {c.upside >= 0 ? '+' : ''}{(c.upside * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 font-mono text-micro text-zinc-600">
                  <span className="text-zinc-400">₹{c.tp}</span>
                  <span>·</span>
                  <span className={c.rating === 'BUY' ? 'text-green' : c.rating === 'SELL' || c.rating === 'REDUCE' ? 'text-red' : 'text-zinc-400'}>{c.rating}</span>
                  <span>·</span>
                  <span>{c.n} {c.n === 1 ? 'broker' : 'brokers'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recency feed */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-micro uppercase tracking-wider text-zinc-500 font-mono">Street moves & catalysts</span>
          {freshCount > 0 && <span className="text-micro font-black text-green font-mono">{freshCount} fresh</span>}
          <span className="text-micro text-zinc-600 font-mono ml-auto">as of {streetData.asOf}</span>
        </div>
        <div className="divide-y divide-white/5">
          {feed.length === 0 && <div className="text-meta text-zinc-600 italic py-2">No street coverage logged yet.</div>}
          {feed.map((it, i) => <FeedRow key={`${it.sym}-${i}`} it={it} cmp={ltpMap[it.sym]} onSelect={onSelect} />)}
        </div>
      </div>
    </div>
  )
}
