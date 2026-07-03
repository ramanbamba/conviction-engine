import { useMemo } from 'react'
import { Shield } from 'lucide-react'
import { computeGuardrails } from '../lib/guardrails'
import SectionHeader from './SectionHeader'
import rearview from '../data/rearview.json'

/**
 * Guardrails — rearview lessons fired forward as live interventions.
 *
 * Matches the current book against the patterns the tradebook proved cost money
 * and surfaces them on the Today tab, so a repeat gets intercepted before it
 * happens. The backward mirror enforcing the forward decision.
 */

const STYLE = {
  red:   { border: 'border-red/25',   bg: 'bg-red/5',   dot: 'text-red',   tag: 'CUT / COMMIT' },
  amber: { border: 'border-amber/25', bg: 'bg-amber/5', dot: 'text-amber', tag: 'HOLD, DON’T TRADE' },
  green: { border: 'border-green/20', bg: 'bg-green/5', dot: 'text-green', tag: 'LET IT RUN' },
}

export default function Guardrails({ holdings = [] }) {
  const guardrails = useMemo(() => computeGuardrails(holdings, rearview), [holdings])
  if (!guardrails.length) return null

  const northStar = rearview?.rules?.[0]

  return (
    <section className="card p-4 space-y-3">
      <SectionHeader icon={Shield} title="Guardrails" subtitle={northStar} />

      <div className="space-y-2">
        {guardrails.map((g, i) => {
          const s = STYLE[g.severity]
          return (
            <div key={i} className={`rounded-lg border ${s.border} ${s.bg} p-2.5`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-black text-white text-caption">{g.title}</span>
                <span className={`text-nano font-mono uppercase tracking-wider shrink-0 ${s.dot}`}>{s.tag}</span>
              </div>
              <p className="text-micro text-zinc-400 leading-relaxed mt-1 font-sans">{g.message}</p>
            </div>
          )
        })}
      </div>

      <p className="text-nano text-zinc-600 leading-relaxed">
        Derived from your {rearview.span?.years}y tradebook · see the Rearview tab for the full autopsy.
      </p>
    </section>
  )
}
