import { useMemo } from 'react'
import { ListChecks, Check } from 'lucide-react'
import pmBrief from '../data/pm-brief.json'
import { computeLandmineScan } from './LandmineRadar'
import { buildActionFeed, TIER_META } from '../lib/actionFeed'

/**
 * ActionFeed — the one ranked, de-duplicated stream of what needs you today.
 * Merges landmines + stops + PM watch + catalysts; excludes ratifiable decisions
 * (those live above with ratify/veto). Honestly silent when nothing demands action.
 * PHASE 10x · Phase 1.
 */
export default function ActionFeed({ holdings = [], alerts = [], catalysts = [] }) {
  const feed = useMemo(() => {
    const decisionSyms = (pmBrief.decisions || [])
      .filter(d => d.tier === 'decision')
      .flatMap(d => d.syms || [])
    // PM watch items → honest WATCH lane (thesis-level, not "near stop")
    const watchItems = (pmBrief.decisions || [])
      .filter(d => d.tier === 'watch')
      .map(d => ({ sym: (d.syms || [])[0], text: d.title }))
    // Suppress nominal stop-noise on strategic buckets (LIQUIDBEES, hedge ETFs)
    const strategic = new Set(holdings.filter(h => ['Hedge', 'Cash', 'Satellites'].includes(h.bucket)).map(h => h.sym))
    const cleanAlerts = alerts.filter(a => !(a.type === 'NEAR_SL' && strategic.has(a.sym)))
    const landmineScan = computeLandmineScan(holdings)
    return buildActionFeed({ landmineScan, alerts: cleanAlerts, catalysts, watchItems, decisionSyms })
  }, [holdings, alerts, catalysts])

  // Calibrated silence — the honest resting state, given room to breathe
  if (feed.quiet) {
    return (
      <section className="calm-rise rounded-xl border border-green/15 bg-green/[0.04] px-5 py-4 flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-full bg-green/10 flex items-center justify-center shrink-0">
          <Check className="w-[18px] h-[18px] text-green" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <div className="text-body font-bold text-zinc-200">All clear — nothing needs you.</div>
          <div className="text-caption text-zinc-500 leading-snug mt-0.5">
            Money is where your mouth is. Today’s discipline is to do nothing.
            {feed.counts.await > 0 && <span className="text-teal"> {feed.counts.await} catalyst{feed.counts.await > 1 ? 's' : ''} ahead — no action yet.</span>}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/2 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
        <ListChecks className="w-4 h-4 text-zinc-400" />
        <span className="text-meta uppercase tracking-wider text-zinc-300 font-black">Needs you</span>
        <span className="text-nano font-mono text-zinc-600 ml-1">
          {feed.counts.cut > 0 && <span className="text-red">{feed.counts.cut} cut · </span>}
          {feed.counts.stop > 0 && <span className="text-red">{feed.counts.stop} stop · </span>}
          {feed.counts.watch > 0 && <span className="text-amber">{feed.counts.watch} watch</span>}
          {feed.counts.await > 0 && <span className="text-teal"> · {feed.counts.await} await</span>}
        </span>
      </div>
      <div className="divide-y divide-white/5">
        {feed.items.map(it => {
          const t = TIER_META[it.tier]
          return (
            <div key={it.sym} className="flex items-start gap-3 px-4 py-2.5">
              <span className={`text-nano font-black uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono shrink-0 ${t.cls}`}>{t.label}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-white text-caption">{it.sym}</span>
                  {it.tags.filter(Boolean).map(tag => (
                    <span key={tag} className="text-nano font-mono text-zinc-600 uppercase">· {tag}</span>
                  ))}
                </div>
                <p className="text-caption text-zinc-400 leading-snug mt-0.5">{it.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
