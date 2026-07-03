/**
 * ResultsDesk — Phase 23. Pre-registered expectations for prints landing soon, so the
 * verdict can't be rationalized after the fact. Reads results-desk.json only — no
 * computation of print dates here (that's the calendar → results:prep pipeline).
 *
 * Renders only when a held name prints within +/-7 days (parent decides visibility).
 */
import Accordion from './Accordion'
import StatusBadge from './StatusBadge'
import resultsDesk from '../data/results-desk.json'
import pmBrief from '../data/pm-brief.json'
import { today, daysBetween } from '../lib/date'

function briefStatus(entry) {
  const t = today()
  if (entry.printDate < t && !entry.verdict) return { label: 'VERDICT DUE', variant: 'VERDICT_DUE' }
  const expectations = entry.preBrief?.expectations || []
  const hasExpectations = expectations.length > 0 && expectations.every(e => (e.expected || '').trim() !== '')
  const hasKillCriteria = (entry.preBrief?.killCriteria || []).length > 0
  if (hasExpectations && hasKillCriteria) return { label: 'PREPPED', variant: 'PREPPED' }
  return { label: 'NEEDS BRIEF', variant: 'NEEDS_BRIEF' }
}

export function upcomingPrints(windowDays = 7) {
  const t = today()
  return Object.entries(resultsDesk.stocks || {})
    .map(([sym, entry]) => ({ sym, ...entry }))
    .filter(e => Math.abs(daysBetween(t, e.printDate)) <= windowDays)
    .sort((a, b) => a.printDate.localeCompare(b.printDate))
}

// Season scoreboard (Phase 24): every name that prints must end in a re-underwrite or
// an exit ticket. "Exit tickets" is derived from pm-brief.json rather than a stored
// flag, so it self-corrects if a brief regenerates.
export function seasonScoreboard() {
  const t = today()
  const entries = Object.entries(resultsDesk.stocks || {})
  const printed = entries.filter(([, e]) => e.printDate <= t).length
  const reUnderwritten = entries.filter(([, e]) => e.reUnderwrite).length
  const brokenSyms = new Set(
    entries.filter(([, e]) => e.verdict && ['MISS', 'THESIS_BREAK'].includes(e.verdict.call)).map(([sym]) => sym)
  )
  const exitTickets = (pmBrief.decisions || []).filter(d =>
    ['CUT', 'TRIM'].includes(d.type) && (d.syms || []).some(s => brokenSyms.has(s))
  ).length
  const overdue = entries.filter(([, e]) => !e.verdict && e.printDate <= t && daysBetween(e.printDate, t) > 3).length
  return { printed, reUnderwritten, exitTickets, overdue }
}

function ScoreboardStrip() {
  const { printed, reUnderwritten, exitTickets, overdue } = seasonScoreboard()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption font-mono text-text-dim border-b border-white/5 pb-2 mb-2">
      <span>{printed} printed</span>
      <span>·</span>
      <span>{reUnderwritten} re-underwritten</span>
      <span>·</span>
      <span>{exitTickets} exit ticket{exitTickets === 1 ? '' : 's'}</span>
      <span>·</span>
      <span className={overdue > 0 ? 'text-red font-bold' : ''}>{overdue} overdue</span>
    </div>
  )
}

export default function ResultsDesk({ onSelect, windowDays = 7 }) {
  const prints = upcomingPrints(windowDays)
  if (prints.length === 0) return null

  return (
    <div className="space-y-2">
      <ScoreboardStrip />
      <div className="text-nano text-text-dim font-mono">{resultsDesk.quarter}</div>
      {prints.map(entry => {
        const status = briefStatus(entry)
        return (
          <div key={entry.sym} className="bg-white/2 border border-white/5 rounded-xl p-3">
            <button
              type="button"
              onClick={() => onSelect?.(entry.sym)}
              className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <strong className="text-white font-mono">{entry.sym}</strong>
                <span className="text-caption text-text-dim font-mono shrink-0">{entry.printDate}</span>
              </div>
              <StatusBadge label={status.label} variant={status.variant} />
            </button>
            <Accordion
              title={<span className="text-caption text-text-dim">expectations + kill criteria</span>}
              className="mt-2"
              titleClassName="text-caption"
            >
              <div className="space-y-2 text-body">
                <div className="flex flex-wrap gap-2">
                  {(entry.preBrief?.expectations || []).map((e, i) => (
                    <span key={i} className="text-caption font-mono bg-zinc-800/40 border border-zinc-700 px-2 py-1 rounded">
                      {e.metric}{e.expected ? `: ${e.expected}` : ''}
                    </span>
                  ))}
                </div>
                {(entry.preBrief?.killCriteria || []).length > 0 && (
                  <ul className="list-disc list-inside text-text-dim text-caption">
                    {entry.preBrief.killCriteria.map((k, i) => <li key={i}>{k}</li>)}
                  </ul>
                )}
                {entry.verdict && (
                  <div className="text-caption text-white pt-1 border-t border-white/5">
                    <StatusBadge label={entry.verdict.call} variant={entry.verdict.call === 'BEAT' ? 'BUY' : entry.verdict.call === 'MISS' || entry.verdict.call === 'THESIS_BREAK' ? 'EXIT' : 'HOLD'} />
                    <span className="ml-2">{entry.verdict.note}</span>
                  </div>
                )}
              </div>
            </Accordion>
          </div>
        )
      })}
    </div>
  )
}
