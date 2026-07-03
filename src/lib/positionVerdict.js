/**
 * positionVerdict.js — the one next-move call, book-wide.
 *
 * Every holding gets a single synthesized verdict that reconciles the signals the
 * product otherwise scatters across four silos: conviction, fundamental grade,
 * stop-loss discipline, bucket rules, the advisor model gap, and the keeper test.
 *
 * It is bucket-aware because the question differs by bucket:
 *   Platinum     → align to Advisor's model (defers to modelGapVerdict)
 *   Power Alpha  → tactical 3-slot trades on a strict −8% stop
 *   Stars        → multibaggers; keeper-led, −25% reassess
 *   Compounders  → buy-and-forget; only act if the thesis breaks
 *   Hedge / Cash → strategic, rule-triggered only
 *
 * Returns { call, tone, reason, severity }. severity 0–3 (3 = act now) for sorting.
 */
import { keeperVerdict } from './keeperTest'

export const VERDICT_TONE_CLS = {
  g: 'text-green',
  a: 'text-amber',
  n: 'text-zinc-400',
  b: 'text-red',
}
export const VERDICT_BADGE = {
  g: 'text-green border-green/30 bg-green/10',
  a: 'text-amber border-amber/30 bg-amber/10',
  n: 'text-zinc-300 border-white/15 bg-white/5',
  b: 'text-red border-red/30 bg-red/10',
}

const mk = (call, tone, reason, severity) => ({ call, tone, reason, severity })
const pct = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

export function positionVerdict(h, fund, opts = {}) {
  if (!h) return null
  const conv = h.conv ?? null
  const pnlPct = h.pnlPct ?? (h.avg ? (h.ltp - h.avg) / h.avg : 0)
  const mg = fund?.computed?.grade || fund?.grade || null
  const flags = fund?.computed?.redFlags || fund?.redFlags || []
  const govFlag = flags.find(f => /pledge|promoter/i.test(f))
  const g = mg ? ` / grade ${mg}` : ''

  // ── 0. Hard stops — every bucket, highest priority ──
  if (h.exitSignal) return mk('EXIT', 'b', `Exit signal flagged — thesis broken. Rotate the capital out.`, 3)
  if (h.ltp && h.sl && h.ltp <= h.sl) return mk('EXIT', 'b', `Stop-loss breached (CMP ₹${h.ltp} ≤ SL ₹${h.sl}). Discipline says cut, no debate.`, 3)

  // ── 1. Bucket-specific ──
  switch (h.bucket) {
    case 'Platinum':
      // Defer to the advisor model reconciliation when we have it.
      if (opts.modelVerdict) return { ...opts.modelVerdict, severity: sevOf(opts.modelVerdict.call) }
      return convGradeCall(conv, mg, pnlPct, g, govFlag, -0.20, 'Platinum')

    case 'Power Alpha': {
      const slDist = (h.ltp && h.avg) ? (h.ltp - h.avg) / h.avg : null
      if (slDist != null && slDist <= -0.08) return mk('TIGHT STOP', 'a', `Down ${pct(slDist)} — past Power Alpha's −8% line. On a tight leash: honour the exit plan, don't average down.`, 2)
      if (conv != null && conv < 6) return mk('ROTATE', 'b', `Tactical slot, conv ${conv}${g}. Not earning its −8%-stop seat — rotate to a cleaner setup.`, 2)
      if (conv != null && conv >= 7) return mk('HOLD', 'n', `Tactical slot working, conv ${conv}${g}. Hold to thesis; honour the −8% stop.`, 1)
      return mk('WATCH', 'a', `Power Alpha slot, conv ${conv ?? '—'}${g}. Borderline — keep it on a defined leash.`, 2)
    }

    case 'Compounders':
      if (govFlag) return mk('CAUTION', 'b', `${cap(govFlag)} — governance risk on a name you mean to forget. Hold, size with care.`, 2)
      if ((conv != null && conv < 6) || mg === 'F') return mk('REVIEW', 'a', `Buy-and-forget name slipping — conv ${conv ?? '—'}${g}. Re-underwrite before adding more.`, 2)
      return mk('HOLD', 'g', `Compounder, conv ${conv ?? '—'}${g}. Buy-and-forget — let it work, ignore the noise.`, 0)

    case 'Hedge':
    case 'Cash':
      return mk('HOLD', 'n', `Strategic ${h.bucket.toLowerCase()} — held by design, not conviction. Deploy only on the rulebook trigger.`, 0)

    default: // Stars, Satellites, anything else → keeper-led
      return starsCall(h, conv, mg, pnlPct, g, govFlag)
  }
}

// conviction + grade reconciliation with a bucket-specific reassess line
function convGradeCall(conv, mg, pnlPct, g, govFlag, reassess, bucket) {
  if (pnlPct <= reassess && (conv ?? 0) < 7) return mk('TRIM', 'b', `Down ${pct(pnlPct)} past the ${bucket} reassess line, conv ${conv ?? '—'}${g}. Cut or re-underwrite.`, 2)
  if (govFlag) return mk('CAUTION', 'b', `${cap(govFlag)} — governance risk overrides. Hold, size with care.`, 2)
  if (mg === 'F' || mg === 'D') return mk('WATCH', 'a', `Conv ${conv ?? '—'} but machine ${mg}. Thesis on probation — no adds until it firms.`, 2)
  if ((conv ?? 0) >= 8) return mk('HOLD', 'g', `Conviction ${conv}${g} — core hold.`, 0)
  if ((conv ?? 0) <= 4) return mk('TRIM', 'b', `Conviction ${conv}${g} — low. Trim/rotate into a keeper.`, 2)
  return mk('HOLD', 'n', `Conviction ${conv ?? '—'}${g} — hold, keep the thesis honest.`, 1)
}

// Stars / satellites — the keeper test is the spine, fundamentals are the cross-check
function starsCall(h, conv, mg, pnlPct, g, govFlag) {
  const k = keeperVerdict(h)
  if (govFlag) return mk('CAUTION', 'b', `${cap(govFlag)} — governance risk. Hold, size with care.`, 2)
  if (k?.verdict === 'CHURN') return mk('TRIM', 'b', k.reason, 2)
  if (mg === 'F') return mk('REVIEW', 'a', `Conv ${conv ?? '—'} but machine F — re-underwrite before adding.`, 2)
  if (k?.verdict === 'KEEP') return pnlPct > 0.5
    ? mk('LET RIDE', 'g', `Multibagger working (${pct(pnlPct)})${g}. Let the winner run.`, 0)
    : mk('HOLD', 'g', k.reason, 0)
  return mk('WATCH', 'a', k?.reason || `Borderline — fix the thesis or let it earn its place.`, 1)
}

function sevOf(call) {
  if (/EXIT|TRIM|CAUTION|ROTATE|DON'T/.test(call)) return 2
  if (/ADD|CLEAN/.test(call)) return 1
  if (/WATCH|SMALL|TIGHT|REVIEW|FROZEN/.test(call)) return 2
  return 0
}
