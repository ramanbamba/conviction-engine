/**
 * pmLoop.js — Phase 16.3: the tape recorder.
 *
 * Closes the supervision loop on pmLedger entries:
 *   1. Stamp refPrice/refDate on any responded entry that lacks one (the price
 *      context the grade is computed against).
 *   2. Detect execution: a RATIFY'd CUT/TRIM whose sym left the book (or whose
 *      qty dropped) is stamped executedAt/executedPrice.
 *   3. Grade outcomes at T+30 and T+90: for a SELL, price falling after exit =
 *      RIGHT (dodged the fall); rising = WRONG (sold a runner); ±5% = NEUTRAL.
 *      A vetoed CUT grades the *veto*: stock up after veto = RIGHT (you beat
 *      the PM), down = WRONG (the PM had it).
 *
 * Pure — takes data in, returns { ledger, events }. Prices come from holdings'
 * ltp; for names already exited, pass quotes = { SYM: price } (e.g. from Kite).
 */
import { today, daysBetween } from './date.js'

const NOISE_BAND = 0.05 // ±5% = NEUTRAL — don't claim credit for noise

function priceOf(sym, holdings, quotes) {
  const h = holdings.find(x => x.sym === sym)
  return h?.ltp ?? quotes?.[sym] ?? null
}

function gradeMove(entry, movePct) {
  // movePct = (now − ref) / ref for the primary sym
  if (movePct == null) return null
  if (Math.abs(movePct) <= NOISE_BAND) return 'NEUTRAL'
  const isSell = ['CUT', 'TRIM'].includes(entry.type)
  if (entry.response === 'RATIFY') {
    // graded question: was the PM's call right?
    return isSell ? (movePct < 0 ? 'RIGHT' : 'WRONG') : (movePct > 0 ? 'RIGHT' : 'WRONG')
  }
  if (entry.response === 'VETO') {
    // graded question: was YOUR override right?
    return isSell ? (movePct > 0 ? 'RIGHT' : 'WRONG') : (movePct < 0 ? 'RIGHT' : 'WRONG')
  }
  return null
}

export function closePmLoop(pmLedger = [], holdings = [], quotes = {}, asOf = today()) {
  const events = []
  const ledger = pmLedger.map(raw => {
    const e = { ...raw }
    const sym = e.syms?.[0]
    if (!sym || !['RATIFY', 'VETO'].includes(e.response)) return e

    // 1. Reference price — stamped at first run after the response
    if (e.refPrice == null) {
      const p = priceOf(sym, holdings, quotes)
      if (p != null) {
        e.refPrice = p
        e.refDate = e.respondedAt || asOf
        events.push(`${e.id}: refPrice ₹${p} stamped`)
      }
    }

    // 2. Execution detection — ratified sell whose position left the book
    if (e.response === 'RATIFY' && ['CUT', 'TRIM'].includes(e.type) && !e.executedAt) {
      const stillHeld = holdings.some(h => h.sym === sym)
      if (!stillHeld) {
        e.executedAt = asOf
        e.executedPrice = e.refPrice ?? quotes?.[sym] ?? null
        events.push(`${e.id}: execution detected — ${sym} left the book`)
      }
    }

    // 3. Outcome grading at T+30 / T+90, measured from the action point
    const baseDate = e.executedAt || e.refDate
    const basePrice = e.executedPrice ?? e.refPrice
    if (baseDate && basePrice != null) {
      const age = daysBetween(baseDate, asOf)
      const now = priceOf(sym, holdings, quotes)
      const move = now != null ? (now - basePrice) / basePrice : null
      e.grade = e.grade || {}
      for (const [key, horizon] of [['t30', 30], ['t90', 90]]) {
        if (age >= horizon && e.grade[key] == null) {
          const g = gradeMove(e, move)
          if (g) {
            e.grade[key] = g
            e.grade[`${key}At`] = asOf
            e.grade[`${key}Move`] = +(move * 100).toFixed(1)
            events.push(`${e.id}: graded ${key} → ${g} (${(move * 100).toFixed(1)}%)`)
          }
        }
      }
    }
    return e
  })
  return { ledger, events }
}
