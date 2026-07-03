import { useState } from 'react'
import { ShieldCheck, Copy, Check } from 'lucide-react'
import SectionHeader from '../SectionHeader'
import Accordion from '../Accordion'
import FreshnessChip from '../FreshnessChip'
import { fL } from '../../lib/format'
import brief from '../../data/pm-brief.json'

/**
 * PMTab — the Autonomous Portfolio Manager (Phase 14), read-only.
 *
 * The product inversion: instead of operating a cockpit, the user supervises a
 * disciplined PM. Shows a daily standing stance (default: hold) + pre-justified
 * decision cards he RATIFIES / VETOES / SNOOZES. It NEVER places a trade — it
 * prepares an order ticket the user copies into his own Kite mobile app.
 */

const TYPE_STYLE = {
  CUT:    { cls: 'text-red',    bg: 'bg-red/10 border-red/25' },
  TRIM:   { cls: 'text-amber',  bg: 'bg-amber/10 border-amber/25' },
  DEPLOY: { cls: 'text-green',  bg: 'bg-green/10 border-green/25' },
  ROTATE: { cls: 'text-teal',   bg: 'bg-teal/10 border-teal/25' },
  WATCH:  { cls: 'text-zinc-400', bg: 'bg-white/5 border-white/10' },
  SL_PROXIMITY:     { cls: 'text-orange', bg: 'bg-orange/10 border-orange/25' },
  CONVICTION_DRIFT: { cls: 'text-amber',  bg: 'bg-amber/10 border-amber/25' },
  HEDGE_GAP:        { cls: 'text-red',    bg: 'bg-red/10 border-red/25' },
  CASH_GAP:         { cls: 'text-red',    bg: 'bg-red/10 border-red/25' },
  BUCKET_GAP:       { cls: 'text-amber',  bg: 'bg-amber/10 border-amber/25' },
  MODEL_GAP:        { cls: 'text-teal',   bg: 'bg-teal/10 border-teal/25' },
  CONCENTRATION:    { cls: 'text-amber',  bg: 'bg-amber/10 border-amber/25' },
  LET_RUN:          { cls: 'text-green',  bg: 'bg-green/10 border-green/25' },
}

// Canonical action vocabulary — the PM speaks the same words as the rest of the app.
// (Structural-gap types like HEDGE_GAP/MODEL_GAP are book posture, left as-is.)
const TYPE_LABEL = { CUT: 'EXIT', DEPLOY: 'ADD', ROTATE: 'ADD', LET_RUN: 'HOLD' }
const labelFor = (t) => TYPE_LABEL[t] || (t || 'WATCH').replace(/_/g, ' ')

function ticketText(t) {
  if (!t) return ''
  const parts = [t.side, t.sym]
  if (t.qty) parts.push(`${t.qty} sh`)
  if (t.limitHint) parts.push(`limit ${t.limitHint}`)
  if (t.note) parts.push(`(${t.note})`)
  return parts.join(' · ')
}

function OrderTicket({ ticket }) {
  const [copied, setCopied] = useState(false)
  if (!ticket) return null
  const text = ticketText(ticket)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 mt-2">
      <span className="font-mono text-caption text-zinc-200 truncate">{text}</span>
      <button onClick={copy} className="shrink-0 flex items-center gap-1 text-nano font-mono uppercase tracking-wider text-zinc-500 hover:text-white cursor-pointer transition-colors">
        {copied ? <><Check className="w-3 h-3 text-green" /> copied</> : <><Copy className="w-3 h-3" /> copy</>}
      </button>
    </div>
  )
}

export default function PMTab({ memory = {}, onPersistMemory, decisionsOnly = false }) {
  const ledger = memory.pmLedger || []
  const [pending, setPending] = useState({}) // optimistic responses

  const responseFor = (id) => pending[id] || ledger.find(x => x.id === id)?.response || 'PENDING'

  const respond = (id, response) => {
    setPending(p => ({ ...p, [id]: response }))
    const today = new Date().toISOString().split('T')[0]
    const updated = {
      ...memory,
      pmLedger: (memory.pmLedger || []).map(x =>
        x.id === id ? { ...x, response, respondedAt: today, snoozeUntil: response === 'SNOOZE' ? addDays(today, 7) : null } : x
      ),
    }
    onPersistMemory?.(updated)
  }

  const standPat = brief.stance === 'STAND_PAT'
  const decisions = (brief.decisions || []).filter(d => d.tier === 'decision')
  const watches = (brief.decisions || []).filter(d => d.tier === 'watch')
  const standing = (brief.decisions || []).filter(d => d.tier === 'standing')
  const p = brief.posture

  // Ledger tally
  const tally = ledger.reduce((a, x) => { a[x.response] = (a[x.response] || 0) + 1; return a }, {})

  const Posture = () => p && (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-white/10 font-mono">
      <div><div className="text-nano text-zinc-500 uppercase tracking-wider">Book</div><div className="text-body font-black text-white">{fL(p.bookValue)}</div></div>
      <div><div className="text-nano text-zinc-500 uppercase tracking-wider">Conv 8+</div><div className={`text-body font-black ${p.hiConvPct >= 60 ? 'text-green' : 'text-amber'}`}>{p.hiConvPct}%</div></div>
      <div><div className="text-nano text-zinc-500 uppercase tracking-wider">Hedge+Cash</div><div className={`text-body font-black ${p.hedgePct >= 6 ? 'text-green' : 'text-red'}`}>{p.hedgePct}%</div></div>
      {p.alphaPct != null && <div><div className="text-nano text-zinc-500 uppercase tracking-wider">Alpha {p.alphaWindow}</div><div className={`text-body font-black ${p.alphaPct >= 0 ? 'text-green' : 'text-red'}`}>{p.alphaPct >= 0 ? '+' : ''}{p.alphaPct}%</div></div>}
      <div><div className="text-nano text-zinc-500 uppercase tracking-wider">Positions</div><div className="text-body font-black text-zinc-300">{p.positions}</div></div>
    </div>
  )

  return (
    <div className="space-y-6 tab-enter select-none">

      {/* ── STANDING STANCE + POSTURE ── */}
      <section className={`rounded-2xl border p-5 ${standPat ? 'border-green/20 bg-green/5' : 'border-amber/25 bg-amber/5'}`}>
        <div className="flex items-center gap-2 text-meta uppercase tracking-wider text-zinc-500">
          <ShieldCheck className={`w-4 h-4 ${standPat ? 'text-green' : 'text-amber'}`} /> Portfolio Manager · {brief.asOf}
          <FreshnessChip asOf={brief.asOf} maxFresh={3} hint="say 'morning brief' to Claude to regenerate" />
        </div>
        {standPat ? (
          <>
            <h2 className="text-hero font-black text-white leading-tight mt-2">Hold. No action warranted.</h2>
            <p className="text-caption text-zinc-400 leading-relaxed mt-1">{brief.standPatReason}</p>
            {brief.streak?.standPatDays > 0 && (
              <p className="text-caption font-mono text-green mt-2">
                {brief.streak.standPatDays} disciplined day{brief.streak.standPatDays > 1 ? 's' : ''} — your tape says this is where alpha lives.
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="text-hero font-black text-white leading-tight mt-2">
              {decisions.length} decision{decisions.length !== 1 ? 's' : ''} for your review.
            </h2>
            <p className="text-caption text-zinc-400 leading-relaxed mt-1">
              Ratify, veto, or snooze. Execute approved trades yourself in Kite — this app never trades.
            </p>
          </>
        )}
        <Posture />
      </section>

      {/* ── DECISION CARDS ── */}
      {decisions.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Decisions" subtitle="Pre-justified by the PM. You approve and act — in your own Kite app." />
          {decisions.map(d => {
            const s = TYPE_STYLE[d.type] || TYPE_STYLE.WATCH
            const resp = responseFor(d.id)
            const decided = resp !== 'PENDING'
            return (
              <div key={d.id} className={`rounded-xl border p-3.5 space-y-2 ${decided ? 'border-white/10 bg-white/2 opacity-70' : 'border-white/10 bg-white/3'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-nano font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.bg} ${s.cls}`}>{labelFor(d.type)}</span>
                    <span className="font-black text-white text-body truncate">{d.title}</span>
                  </div>
                  {d.size && <span className="font-mono text-caption text-zinc-400 shrink-0">₹{(d.size / 1e5).toFixed(2)}L</span>}
                </div>
                <p className="text-caption text-zinc-300 leading-relaxed">{d.rationale}</p>
                {d.rearviewNote && (
                  <p className="text-nano text-amber/90 font-mono leading-relaxed">⟲ Your tape: {d.rearviewNote}</p>
                )}
                <OrderTicket ticket={d.ticket} />
                {decided ? (
                  <div className={`text-meta font-mono uppercase tracking-wider ${resp === 'RATIFY' ? 'text-green' : resp === 'VETO' ? 'text-red' : 'text-zinc-500'}`}>
                    {resp === 'RATIFY' ? '✓ Ratified — execute in Kite' : resp === 'VETO' ? '✗ Vetoed' : '⏸ Snoozed 7d'}
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => respond(d.id, 'RATIFY')} className="flex-1 text-meta font-black uppercase tracking-wider py-1.5 rounded-lg border border-green/30 bg-green/10 text-green hover:bg-green/20 cursor-pointer transition-colors">Ratify</button>
                    <button onClick={() => respond(d.id, 'VETO')} className="flex-1 text-meta font-black uppercase tracking-wider py-1.5 rounded-lg border border-red/20 bg-red/5 text-red hover:bg-red/15 cursor-pointer transition-colors">Veto</button>
                    <button onClick={() => respond(d.id, 'SNOOZE')} className="px-3 text-meta font-black uppercase tracking-wider py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 cursor-pointer transition-colors">Snooze</button>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      {/* ── WATCH LIST (folded into the unified Action Feed when decisionsOnly) ── */}
      {!decisionsOnly && watches.length > 0 && (
        <section className="space-y-2">
          <SectionHeader title="On watch" subtitle="Catalysts, stop-loss proximity, conviction drift — monitoring, no action." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
          {watches.map(d => {
            const s = TYPE_STYLE[d.type] || TYPE_STYLE.WATCH
            return (
              <div key={d.id} className="rounded-lg border border-white/5 bg-white/2 p-2.5 transition-colors hover:bg-white/[0.04]">
                <div className="flex items-center gap-2">
                  <span className={`text-nano font-black uppercase tracking-wider ${s.cls}`}>{labelFor(d.type)}</span>
                  <span className="font-mono font-black text-white text-caption truncate">{d.title}</span>
                </div>
                <p className="text-nano text-zinc-500 leading-relaxed mt-1">{d.rationale}</p>
              </div>
            )
          })}
          </div>
        </section>
      )}

      {/* ── STANDING POSTURE (collapsed — context, not a prod to act) ── */}
      {!decisionsOnly && standing.length > 0 && (
        <Accordion title={
          <div className="flex items-center gap-2 py-1">
            <span className="text-meta uppercase tracking-wider">Standing posture</span>
            <span className="text-nano bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded font-mono ml-1">{standing.length}</span>
          </div>
        }>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start pt-2">
          {standing.map(d => {
            const s = TYPE_STYLE[d.type] || TYPE_STYLE.WATCH
            return (
              <div key={d.id} className="rounded-lg border border-white/5 bg-white/2 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-nano font-black uppercase tracking-wider ${s.cls}`}>{labelFor(d.type)}</span>
                    <span className="font-mono font-black text-white text-caption truncate">{d.title}</span>
                  </div>
                  {d.size && <span className="font-mono text-nano text-zinc-500 shrink-0">{fL(d.size)}</span>}
                </div>
                <p className="text-nano text-zinc-500 leading-relaxed mt-1">{d.rationale}</p>
              </div>
            )
          })}
          </div>
        </Accordion>
      )}

      {/* ── PM vs YOU LEDGER (collapsed — historical record) ── */}
      {ledger.length > 0 && (
        <Accordion title={<span className="text-meta uppercase tracking-wider">Supervision ledger</span>}>
          <div className="flex gap-3 font-mono text-caption pt-3">
            <span className="text-green">{tally.RATIFY || 0} ratified</span>
            <span className="text-red">{tally.VETO || 0} vetoed</span>
            <span className="text-zinc-500">{tally.SNOOZE || 0} snoozed</span>
            <span className="text-zinc-600">{tally.PENDING || 0} pending</span>
          </div>
        </Accordion>
      )}

      <p className="text-nano text-zinc-600 leading-relaxed border-t border-white/5 pt-3">
        The PM proposes; you dispose. This app never places, modifies, or cancels orders — execute ratified trades yourself in Kite.
        Brief generated {brief.generatedBy === 'claude' ? 'by Claude judgment' : 'deterministically'} · {brief.asOf}.
      </p>
    </div>
  )
}

function addDays(dateStr, n) {
  const d = new Date(dateStr); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
