import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import alphaHistory from '../data/alpha-history.json'
import { validateAlpha, TIER_ORDER, TIER_META } from '../lib/alphaValidation'

const pct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

const VERDICT_META = {
  PROVEN:   { cls: 'text-green border-green/30 bg-green/10', line: "The model's tier ordering holds on realized returns — STRONG names lead. The engine has earned the right to concentrate behind it." },
  PARTIAL:  { cls: 'text-teal border-teal/30 bg-teal/10', line: "STRONG names lead, but the full ordering isn't clean yet. Trust the top tier for sizing; keep recording before leaning on the bottom." },
  EARLY:    { cls: 'text-amber border-amber/30 bg-amber/10', line: "Too short a window to certify the full ordering — junk bounces in a rally. The STRONG-tier edge is the signal to act on now; the rest needs time and a down-tape." },
  UNPROVEN: { cls: 'text-red border-red/30 bg-red/10', line: "The model's tiers are not separating on realized returns. Do not concentrate on its word until this turns — re-examine the inputs." },
}

/**
 * ModelEdge — the machine mirror. Grades the AlphaModel on its own recorded
 * snapshots: forward return by tier-at-baseline. The proof that earns the right
 * to concentrate (ALPHA_MODEL.md §4). Sibling of CalibrationCard (which grades
 * the human). Reads alpha-history.json + live prices.
 */
export default function ModelEdge({ holdings = [] }) {
  const v = useMemo(() => {
    const live = Object.fromEntries(holdings.map(h => [h.sym, h.ltp]))
    return validateAlpha(alphaHistory, live)
  }, [holdings])

  if (!v.ready) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/2 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-zinc-500" />
          <div className="text-meta uppercase tracking-wider text-zinc-400 font-black">Model Edge</div>
        </div>
        <p className="text-caption text-zinc-500">{v.reason} <span className="text-zinc-600">Run <span className="font-mono">npm run alpha:snapshot</span> over time to build the record.</span></p>
      </section>
    )
  }

  const vm = VERDICT_META[v.verdict] || VERDICT_META.EARLY
  const tiers = TIER_ORDER.map(t => ({ key: t, ...v.byTier[t], meta: TIER_META[t] })).filter(t => t.n > 0)
  const maxAbs = Math.max(...tiers.map(t => Math.abs(t.avgRet || 0)), 0.01)

  return (
    <section className="rounded-xl border border-white/10 bg-white/2 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-green" />
          <div>
            <div className="text-meta uppercase tracking-wider text-zinc-400 font-black">Model Edge</div>
            <div className="text-nano text-zinc-600">AlphaModel tier → realized return · {v.window}d window · {v.snapshots} snapshots</div>
          </div>
        </div>
        <span className={`text-micro font-black uppercase tracking-wider px-2 py-0.5 rounded border font-mono ${vm.cls}`}>{v.verdict}</span>
      </div>

      {/* Headline: does the top tier beat the book? */}
      <div className="flex items-baseline gap-2 font-mono">
        <span className="text-nano text-zinc-500 uppercase tracking-wider">STRONG vs book</span>
        <span className={`text-body font-black ${v.strongEdge >= 0 ? 'text-green' : 'text-red'}`}>
          {v.strongEdge >= 0 ? '+' : ''}{(v.strongEdge * 100).toFixed(1)}pp
        </span>
        <span className="text-nano text-zinc-600">({pct(v.byTier.STRONG.avgRet)} vs {pct(v.bookAvg)} book)</span>
      </div>

      {/* Tier bars */}
      <div className="space-y-1.5">
        {tiers.map(t => {
          const w = Math.abs(t.avgRet || 0) / maxAbs * 100
          const up = (t.avgRet || 0) >= 0
          return (
            <div key={t.key} className="flex items-center gap-2">
              <span className={`text-nano font-mono font-black w-16 shrink-0 ${t.meta.cls}`}>{t.key}</span>
              <div className="flex-1 h-3 rounded bg-white/5 relative overflow-hidden">
                <div className="h-full rounded" style={{ width: `${w.toFixed(0)}%`, background: t.meta.color, opacity: up ? 0.9 : 0.5 }} />
              </div>
              <span className={`text-micro font-mono font-black w-12 text-right ${up ? 'text-green' : 'text-red'}`}>{pct(t.avgRet)}</span>
              <span className="text-nano font-mono text-zinc-600 w-8 text-right">n={t.n}</span>
            </div>
          )
        })}
      </div>

      <p className="text-caption text-zinc-400 leading-snug">
        {v.monotonic
          ? <><span className="text-green font-bold">Ordering holds.</span> {vm.line}</>
          : <><span className="text-amber font-bold">Ordering imperfect.</span> {vm.line}</>}
      </p>

      <div className="text-micro font-mono text-zinc-600 pt-1 border-t border-white/5">
        Baseline {v.baselineDate} → {v.currentDate}. Snapshot daily via <span className="text-zinc-400">npm run alpha:snapshot</span> (wired into npm run morning) to extend the window.
      </div>
    </section>
  )
}
