import { useState } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { fP, fR } from '../lib/format'

// B3: T+30 / T+90 reflection modal
// Asks "was the call directionally right?" and captures outcome notes
export default function ReflectionModal({ entry, holding, onSubmit, onClose }) {
  const [verdict,  setVerdict]  = useState('')   // 'right' | 'wrong' | 'partial'
  const [notes,    setNotes]    = useState('')
  const [error,    setError]    = useState('')

  if (!entry) return null

  const pnlPct = holding?.pnlPct ?? null
  const pnlColor = pnlPct == null ? 'text-text-dim' : pnlPct >= 0 ? 'text-green' : 'text-red'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!verdict) { setError('Select a verdict first'); return }
    onSubmit({ verdict, notes: notes.trim(), pnlPctAtReflection: pnlPct })
  }

  const VERDICTS = [
    { id: 'right',   label: 'Thesis Right',   cls: 'border-green/30 bg-green/8 text-green',   sel: 'border-green bg-green/15 ring-2 ring-green/30' },
    { id: 'partial', label: 'Partial / Mixed', cls: 'border-amber/30 bg-amber/8 text-amber',   sel: 'border-amber bg-amber/15 ring-2 ring-amber/30' },
    { id: 'wrong',   label: 'Thesis Wrong',   cls: 'border-red/30 bg-red/8 text-red',          sel: 'border-red bg-red/15 ring-2 ring-red/30' },
  ]

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#020610]/95 backdrop-blur-md" onClick={onClose} />

      <div className="bg-card border border-[#223355] rounded-2xl w-full max-w-md relative z-10 shadow-[0_10px_50px_rgba(0,0,0,0.8)] overflow-hidden">
        <div className="absolute left-0 top-0 right-0 h-[2px] bg-gradient-to-r from-purple via-blue to-teal" />

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-meta font-black uppercase tracking-widest text-zinc-400 mb-0.5">
                T+{entry.checkpoint} Reflection
              </div>
              <div className="text-base font-extrabold text-white">{entry.sym}</div>
              <div className="text-meta text-text-dim mt-0.5">
                Entered {entry.date} · {entry.daysHeld} days held
              </div>
            </div>
            <button onClick={onClose} className="text-text-dim hover:text-white transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Original thesis */}
          <div className="bg-dark/60 border border-white/8 rounded-xl px-4 py-3">
            <div className="text-meta font-bold text-text-dim uppercase tracking-wider mb-1.5">Your entry thesis</div>
            <p className="text-xs text-text-sec italic leading-relaxed">"{entry.thesis}"</p>
          </div>

          {/* Current P&L */}
          {holding && (
            <div className="flex items-center justify-between bg-dark/40 border border-white/5 rounded-xl px-4 py-3">
              <div>
                <div className="text-meta text-text-dim uppercase tracking-wider mb-0.5">Current P&amp;L</div>
                <div className={`font-mono text-lg font-extrabold ${pnlColor}`}>
                  {fP(pnlPct)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-meta text-text-dim uppercase tracking-wider mb-0.5">Current LTP</div>
                <div className="font-mono text-sm font-bold text-white">{fR(holding.ltp)}</div>
                {entry.avgAtEntry && (
                  <div className="text-meta text-text-dim">Entered @ {fR(entry.avgAtEntry)}</div>
                )}
              </div>
            </div>
          )}

          {/* Verdict picker */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="text-meta text-text-dim uppercase tracking-wider font-bold mb-2">
                Was your thesis directionally correct?
              </div>
              <div className="grid grid-cols-3 gap-2">
                {VERDICTS.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => { setVerdict(v.id); setError('') }}
                    className={`border rounded-xl px-2 py-3 text-meta font-bold uppercase tracking-wider cursor-pointer transition-all ${
                      verdict === v.id ? v.sel : v.cls
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-meta text-text-dim uppercase tracking-wider font-bold block mb-1.5">
                What changed? (optional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Order book held but margins compressed — partial. Watching for Q2 improvement."
                className="w-full bg-deep border border-white/10 rounded-xl px-3 py-3 text-xs text-white placeholder-text-dim focus:outline-none focus:border-zinc-700 transition-colors resize-none leading-relaxed"
              />
            </div>

            {error && (
              <p className="text-meta text-red flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 border border-white/10 bg-transparent hover:bg-white/5 text-text-sec hover:text-white transition-all font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Skip
              </button>
              <button
                type="submit"
                className="flex-1 bg-zinc-800 hover:bg-zinc-800 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Log Reflection
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
