import { useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import SectionHeader from './SectionHeader'
import digest from '../data/conviction-digest.json'

/**
 * ConvictionChangelog — the weekly "what the engine changed and why" digest.
 *
 * The veto half of the auto + digest design: conviction moves automatically as
 * results/news land; this is the 20-second review where you can flag a call you
 * disagree with. Reads conviction-digest.json directly (no props needed).
 *
 * Only renders when the digest is recent (<= 10 days) and has changes.
 * Veto: logs intent via onToast — the revert happens on the next sync.
 */

function daysSince(dateStr) {
  const d = new Date(dateStr)
  return isNaN(d) ? 9999 : Math.round((Date.now() - d.getTime()) / 86400000)
}

export default function ConvictionChangelog({ onToast }) {
  const [vetoed, setVetoed] = useState(() => new Set())

  const changes = digest?.changes ?? []
  const fresh = digest?.weekOf && daysSince(digest.weekOf) <= 10
  if (!fresh || changes.length === 0) return null

  const veto = (sym) => {
    setVetoed(prev => new Set(prev).add(sym))
    onToast?.({ message: `Vetoed ${sym} — flag noted, will revert on next sync`, type: 'info' })
  }

  return (
    <section className="card p-4 space-y-3">
      <SectionHeader
        title={<><span className="text-teal">◷</span> Conviction Changelog</>}
        subtitle={`Auto re-scored from this week's results & news · ${digest.weekOf}`}
        right={<span className="text-meta font-mono text-teal">{changes.length} {changes.length === 1 ? 'move' : 'moves'}</span>}
      />

      <div className="space-y-2">
        {changes.map(c => {
          const up = c.direction === 'up'
          const Icon = up ? TrendingUp : TrendingDown
          const isVetoed = vetoed.has(c.sym)
          return (
            <div
              key={c.id ?? c.sym}
              className={`rounded-lg border bg-white/2 p-2.5 ${isVetoed ? 'border-white/10 opacity-50' : 'border-white/5'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-black text-white text-caption">{c.sym}</span>
                  <span className={`flex items-center gap-1 font-mono text-caption font-bold ${up ? 'text-green' : 'text-red'}`}>
                    <Icon className="w-3 h-3" />
                    {c.from}<span className="text-zinc-600">→</span>{c.to}
                  </span>
                </div>
                {isVetoed ? (
                  <span className="text-micro font-mono text-zinc-500 uppercase tracking-wider shrink-0">Vetoed</span>
                ) : (
                  <button
                    onClick={() => veto(c.sym)}
                    className="text-micro font-mono text-zinc-500 hover:text-red uppercase tracking-wider shrink-0 cursor-pointer transition-colors"
                  >
                    Veto
                  </button>
                )}
              </div>
              <p className="text-micro text-zinc-400 leading-snug mt-1 font-sans">{c.reason}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
