import React, { useState, useMemo } from 'react'
import { X, ShieldAlert, Zap, TrendingUp, HelpCircle } from 'lucide-react'
import { runScenario, SCENARIOS } from '../lib/scenarioEngine'
import { fL, fP } from '../lib/format'
import StatusBadge from './StatusBadge'

export default function ScenarioModal({ isOpen, onClose, holdings = [] }) {
  const [activeScenario, setActiveScenario] = useState('NIFTY_MINUS_10') // default

  const result = useMemo(() => {
    if (!activeScenario || !holdings.length) return null
    return runScenario(holdings, activeScenario)
  }, [activeScenario, holdings])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 font-sans select-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#020610]/90 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Container */}
      <div className="bg-[#050D18] border border-white/10 rounded-2xl w-full max-w-2xl h-[70vh] flex flex-col relative z-10 shadow-[0_10px_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Top Highlight strip */}
        <div className="absolute left-0 top-0 right-0 h-[2px] bg-gradient-to-r from-red/20 via-red/50 to-red/20" />

        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <div className="text-heading text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red" /> Stress Test Simulator
            </div>
            <div className="text-caption text-zinc-500 mt-1">Estimate portfolio drawdowns and tailwinds under extreme scenarios</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/2 hover:bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs for scenarios */}
        <div className="flex bg-black/20 border-b border-white/5 p-1 shrink-0 gap-1">
          {Object.entries(SCENARIOS).map(([key, value]) => {
            const active = activeScenario === key
            return (
              <button
                key={key}
                onClick={() => setActiveScenario(key)}
                className={`flex-1 py-2 text-caption rounded-lg font-mono font-bold tracking-wider cursor-pointer uppercase transition-all duration-200 ${
                  active 
                    ? 'bg-zinc-800 text-white border border-white/10' 
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                }`}
              >
                {value.label}
              </button>
            )
          })}
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {result && (
            <>
              {/* Scenario Description & estimated total impact */}
              <div className="bg-white/2 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-nano uppercase text-zinc-500 font-bold font-mono">Scenario Profile</div>
                  <div className="text-body text-zinc-300 font-semibold leading-relaxed">
                    {result.description}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-nano uppercase text-zinc-500 font-bold font-mono block mb-1">Estimated Impact</span>
                  <div className={`font-mono text-base font-black ${result.estimatedImpact >= 0 ? 'text-green' : 'text-red'}`}>
                    {result.estimatedImpact >= 0 ? '+' : ''}{fL(result.estimatedImpact)}
                  </div>
                  <span className={`text-caption font-mono font-bold block ${result.estimatedImpact >= 0 ? 'text-green' : 'text-red'}`}>
                    ({result.estimatedImpact >= 0 ? '+' : ''}{fP(result.estimatedImpactPct)})
                  </span>
                </div>
              </div>

              {/* Impacted Holdings */}
              <div className="space-y-3">
                <div className="text-meta text-zinc-500 font-bold uppercase tracking-wider">
                  Holdings Sensitivity ({result.impactedStocks.length})
                </div>

                <div className="border border-white/5 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-meta font-mono">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500 bg-white/2">
                        <th className="px-3 py-2 text-left font-black">Holding</th>
                        <th className="px-3 py-2 text-left font-black">Sensitivities / Reason</th>
                        <th className="px-3 py-2 text-right font-black">Est. Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/2">
                      {result.impactedStocks.map(s => {
                        const isPos = s.direction === 'positive'
                        const isNeg = s.direction === 'negative'
                        const changeColor = isPos ? 'text-green' : isNeg ? 'text-red' : 'text-zinc-400'

                        return (
                          <tr key={s.sym} className="hover:bg-white/2 transition-colors">
                            <td className="px-3 py-2.5 font-bold text-white flex items-center gap-2">
                              <span>{s.sym}</span>
                              <StatusBadge label={s.bucket} />
                            </td>
                            <td className="px-3 py-2.5 text-zinc-400 font-sans italic">{s.reason}</td>
                            <td className={`px-3 py-2.5 text-right font-bold font-mono ${changeColor}`}>
                              {s.estimatedChange !== 0 ? (s.estimatedChange > 0 ? '+' : '') + fL(s.estimatedChange) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      {result.impactedStocks.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-zinc-500">
                            No holdings are affected under this stress test.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
