import { Scale } from 'lucide-react'
import Accordion from './Accordion'
import ledgerData from '../data/decision-ledger.json'
import { fR } from '../lib/format'

const pct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const alphaCls = v => v == null ? 'text-zinc-500' : v >= 0 ? 'text-green' : 'text-red'

/**
 * DecisionLedger — Phase 25. Grades the product's own advice: has following
 * the PM's ratified/vetoed decisions beaten doing nothing, vs Nifty? Sibling
 * of ModelEdge (which grades the AlphaModel) — this grades the decision layer.
 * Reads decision-ledger.json (npm run ledger, reads memory.json.pmLedger).
 */
export default function DecisionLedger() {
  const { decisions = [], cumulative = {}, asOf } = ledgerData
  if (!decisions.length) return null

  // Prefer the longer-horizon read once enough decisions have aged into it.
  const headlineKey = cumulative.t90?.count > 0 ? 't90' : 't30'
  const headline = cumulative[headlineKey]

  return (
    <section className="rounded-xl border border-white/10 bg-white/2 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-green" />
          <div>
            <div className="text-meta uppercase tracking-wider text-zinc-400 font-black">Decision Ledger</div>
            <div className="text-nano text-zinc-600">has the PM's advice beaten doing nothing? · {headlineKey.toUpperCase()} · as of {asOf}</div>
          </div>
        </div>
      </div>

      <div className="flex items-baseline gap-2 font-mono">
        <span className="text-nano text-zinc-500 uppercase tracking-wider">Cumulative decision-alpha</span>
        <span className={`text-body font-black ${alphaCls(headline?.alphaPct)}`}>{pct(headline?.alphaPct)}</span>
        {headline?.alphaRs != null && (
          <span className="text-nano text-zinc-600">({headline.alphaRs >= 0 ? '+' : '−'}{fR(Math.abs(headline.alphaRs))})</span>
        )}
        <span className="text-nano text-zinc-600">n={headline?.count ?? 0}</span>
      </div>

      <Accordion
        title={<span className="text-caption text-zinc-400">{decisions.length} decisions graded</span>}
        className="border-t border-white/5 pt-2"
      >
        <div className="space-y-2">
          {decisions.map(d => {
            const g = d[headlineKey]
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 py-1 border-b border-white/5 last:border-0">
                <div className="min-w-0">
                  <span className="text-caption font-mono font-bold text-white">{d.type}</span>
                  <span className="text-nano text-zinc-500 ml-1.5">{d.primarySym}</span>
                  <span className="text-nano text-zinc-600 ml-1.5">{d.response} · {d.decisionDate}</span>
                </div>
                <span className={`text-caption font-mono font-black shrink-0 ${alphaCls(g?.alphaPct)}`}>
                  {g ? pct(g.alphaPct) : 'pending'}
                </span>
              </div>
            )
          })}
        </div>
      </Accordion>
    </section>
  )
}
