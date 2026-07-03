import React from 'react'
import { AlertCircle, CheckCircle, Shield, Award, Activity, TrendingUp, Calendar } from 'lucide-react'
import { useEdgeAnalytics } from '../hooks/useEdgeAnalytics'
import Accordion from './Accordion'
import StatusBadge from './StatusBadge'

export default function EdgePanel({ memory = {}, holdings = [] }) {
  const edge = useEdgeAnalytics(memory, holdings)
  if (!edge) return null

  const {
    hitRate,
    convictionDriftMap,
    catalystLog,
    mistakePatterns,
    disciplineStreak,
    bypassLog,
    headline
  } = edge

  const getHitRateColor = (pct) => {
    if (pct === null || pct === undefined) return 'text-zinc-500'
    if (pct >= 0.60) return 'text-green'
    if (pct >= 0.40) return 'text-amber'
    return 'text-red'
  }

  const getStreakColor = (days) => {
    if (days === null || days === undefined) return 'text-zinc-500'
    if (days >= 7) return 'text-green'
    if (days >= 3) return 'text-amber'
    return 'text-red'
  }

  return (
    <Accordion
      title={
        <div className="flex items-center gap-2 py-1">
          <span className="text-meta font-black text-zinc-500 uppercase tracking-wider">Decision Intelligence</span>
          {headline && (
            <span className="text-caption font-mono text-zinc-600 truncate">{headline}</span>
          )}
        </div>
      }
      className="border-b border-white/5 pb-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-4 font-sans">
        
        {/* ── PANEL 1: HIT RATE ── */}
        <div className="space-y-3">
          <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2 border-b border-white/5 pb-1.5">
            <Award className="w-3.5 h-3.5 text-zinc-400" /> Thesis Hit Rate
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className={`text-hero font-mono font-black leading-none ${getHitRateColor(hitRate.pct)}`}>
              {hitRate.pct !== null ? `${Math.round(hitRate.pct * 100)}%` : '—'}
            </span>
            <div className="text-caption text-zinc-500 font-mono">
              {hitRate.validated} validated / {hitRate.total} total
            </div>
          </div>
          
          {Object.keys(hitRate.byBucket || {}).length > 0 ? (
            <div className="overflow-x-auto pt-1">
              <table className="w-full text-left border-collapse text-caption font-mono">
                <thead>
                  <tr className="text-zinc-600 border-b border-white/2">
                    <th className="py-1">Bucket</th>
                    <th className="py-1 text-right">Hit Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/2 text-zinc-400">
                  {Object.entries(hitRate.byBucket).map(([bName, bData]) => {
                    const bTotal = bData.validated + bData.invalidated
                    const bPct = bTotal > 0 ? bData.validated / bTotal : 0
                    return (
                      <tr key={bName}>
                        <td className="py-1">{bName}</td>
                        <td className={`py-1 text-right font-bold ${getHitRateColor(bPct)}`}>
                          {bData.validated}/{bTotal} ({Math.round(bPct * 100)}%)
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-micro text-zinc-600 font-mono italic pt-1">No T+30/T+90 verdicts logged yet.</div>
          )}
        </div>

        {/* ── PANEL 2: CONVICTION DRIFT MAP ── */}
        <div className="space-y-3">
          <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2 border-b border-white/5 pb-1.5">
            <Activity className="w-3.5 h-3.5 text-zinc-400" /> Conviction Drift Map (90d)
          </div>
          {convictionDriftMap.length > 0 ? (
            <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1 text-caption font-mono text-zinc-400">
              {convictionDriftMap.slice(0, 5).map((entry, idx) => {
                const isUp = entry.to >= entry.from
                return (
                  <div key={entry.id || idx} className="flex justify-between items-center bg-white/2 border border-white/5 rounded px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <strong className="text-white">{entry.sym}</strong>
                      <span className={isUp ? 'text-green' : 'text-red'}>{isUp ? '↑' : '↓'}</span>
                      <span className="text-zinc-500 font-bold">{entry.from}→{entry.to}</span>
                    </div>
                    <span className="text-nano text-zinc-500">{entry.date}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-micro text-zinc-600 font-mono italic py-2">No conviction changes in 90d.</div>
          )}
        </div>

        {/* ── PANEL 3: CATALYST OUTCOME LOG ── */}
        <div className="space-y-3">
          <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2 border-b border-white/5 pb-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" /> Catalyst Outcome Log
          </div>
          {catalystLog.length > 0 ? (
            <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1 text-caption font-mono text-zinc-400">
              {catalystLog.slice(0, 5).map((log, idx) => (
                <div key={log.id || idx} className="flex justify-between items-center bg-white/2 border border-white/5 rounded px-2.5 py-1.5 gap-2">
                  <div className="truncate min-w-0">
                    <strong className="text-white mr-1.5">{log.sym}</strong>
                    <span className="text-zinc-500 truncate" title={log.event}>
                      {log.event.length > 25 ? `${log.event.slice(0, 25)}...` : log.event}
                    </span>
                  </div>
                  <span className={`shrink-0 font-bold ${log.hasOutcome ? 'text-green' : 'text-zinc-500'}`}>
                    {log.hasOutcome ? '✓ outcome' : 'no outcome'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-micro text-zinc-600 font-mono italic py-2">No catalysts logged yet.</div>
          )}
        </div>

        {/* ── PANEL 4: MISTAKE PATTERNS ── */}
        <div className="space-y-3">
          <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2 border-b border-white/5 pb-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-zinc-400" /> Mistake Patterns
          </div>
          {mistakePatterns.length > 0 ? (
            <div className="space-y-2 text-caption font-mono text-zinc-400">
              {mistakePatterns.slice(0, 4).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white/2 border border-white/5 rounded px-2.5 py-1.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge label={item.type} variant="EXIT" />
                    <span className="text-white font-bold">×{item.count}</span>
                  </div>
                  <span className="text-nano text-zinc-500">
                    {item.examples.join(', ')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-micro text-zinc-600 font-mono italic py-2">No patterns detected yet — keep logging.</div>
          )}
        </div>

        {/* ── PANEL 5: DISCIPLINE STREAK ── */}
        <div className="space-y-3">
          <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2 border-b border-white/5 pb-1.5">
            <Shield className="w-3.5 h-3.5 text-zinc-400" /> Discipline Streak
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className={`text-hero font-mono font-black leading-none ${getStreakColor(disciplineStreak.days)}`}>
              {disciplineStreak.days !== null ? `${disciplineStreak.days}d` : '—'}
            </span>
            <div className="text-caption text-zinc-500 font-mono">
              {disciplineStreak.days !== null ? 'days clean of bypasses' : 'clean history logged'}
            </div>
          </div>
          {disciplineStreak.lastBypass && (
            <div className="text-caption text-amber bg-amber/5 border border-amber/15 rounded-lg px-2.5 py-1.5 leading-snug">
              <span className="text-meta text-amber block font-bold mb-0.5">Last Overridden Rule</span>
              <span>
                {disciplineStreak.lastBypass.pattern} on{' '}
                <strong className="text-white font-mono">{disciplineStreak.lastBypass.sym}</strong> (
                {disciplineStreak.lastBypass.date})
              </span>
            </div>
          )}
        </div>

        {/* ── PANEL 6: BYPASS LOG ── */}
        <div className="space-y-3">
          <div className="text-meta text-zinc-500 font-bold uppercase flex items-center gap-2 border-b border-white/5 pb-1.5">
            <Activity className="w-3.5 h-3.5 text-zinc-400" /> Pattern Bypass Log
          </div>
          {bypassLog.length > 0 ? (
            <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1 text-caption font-mono text-zinc-400">
              {bypassLog.slice(0, 5).map((log, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white/2 border border-white/5 rounded px-2.5 py-1.5 gap-2">
                  <div className="truncate">
                    <span className="text-red font-bold uppercase mr-2">[BYPASS]</span>
                    <span className="text-white">{log.pattern}</span>
                    {log.sym && <span className="text-zinc-500 ml-1.5">({log.sym})</span>}
                  </div>
                  <span className="text-nano text-zinc-500 shrink-0">{log.date}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-micro text-zinc-600 font-mono italic py-2">No bypasses logged — clean record.</div>
          )}
        </div>

      </div>
    </Accordion>
  )
}
