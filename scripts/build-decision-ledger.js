#!/usr/bin/env node
/**
 * build-decision-ledger.js — Phase 25: the Alpha Ledger.
 *
 * Answers "has the product's advice beaten doing nothing?" Walks memory.json's
 * pmLedger (RATIFY/VETO decisions only — PENDING has no outcome to grade),
 * and at each horizon where enough time has passed, computes:
 *
 *   stockRet  = (price at horizon − refPrice) / refPrice        [primary sym]
 *   niftyRet  = (Nifty at horizon − Nifty at refDate) / Nifty at refDate
 *   excessRet = stockRet − niftyRet
 *   alphaPct  = isSell(type) ? −excessRet : excessRet
 *
 * The sign flip mirrors pmLoop.js's RIGHT/WRONG convention: for a sell-type
 * decision (CUT/TRIM), the advice pays off when the stock underperforms Nifty
 * after the sell (excessRet < 0 → alphaPct > 0). For a VETO, this computes the
 * counterfactual — what obeying the advice would have produced — not the
 * user's override; grading the override itself is pmLoop's job, not this one.
 *
 *   npm run ledger
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import YahooFinance from 'yahoo-finance2'
import { today, daysBetween } from '../src/lib/date.js'

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] })
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const D = path.join(ROOT, 'src', 'data')

const ASOF = today()
const HORIZONS = [['t30', 30], ['t90', 90]]

const YAHOO_OVERRIDES = { 'M&MFIN': 'M%26MFIN' }

function dateAdd(isoStr, days) {
  const d = new Date(isoStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function closeOnOrBefore(series, date) {
  const hits = series.filter(x => x.date <= date)
  return hits.length ? +hits[hits.length - 1].close.toFixed(2) : null
}

// Historical daily closes from decisionDate-2d through today (small buffer for
// non-trading days), for a given Yahoo symbol suffix pair.
async function fetchSeries(sym, fromDate) {
  const yahooSym = YAHOO_OVERRIDES[sym] ?? sym
  for (const ex of ['NS', 'BO']) {
    try {
      const period1 = new Date(dateAdd(fromDate, -5))
      const result = await yahooFinance.chart(`${yahooSym}.${ex}`, {
        period1, period2: new Date(), interval: '1d',
      })
      const quotes = result?.quotes || []
      const series = quotes
        .filter(q => q.close != null)
        .map(q => ({ date: q.date.toISOString().split('T')[0], close: q.close }))
      if (series.length) return series
    } catch { /* try next exchange */ }
  }
  return null
}

async function fetchNiftySeries(fromDate) {
  const result = await yahooFinance.chart('^NSEI', {
    period1: new Date(dateAdd(fromDate, -5)), period2: new Date(), interval: '1d',
  })
  return (result?.quotes || [])
    .filter(q => q.close != null)
    .map(q => ({ date: q.date.toISOString().split('T')[0], close: q.close }))
}

async function main() {
  const memory = JSON.parse(fs.readFileSync(path.join(D, 'memory.json'), 'utf8'))
  const ledger = memory.pmLedger || []

  const graded = ledger.filter(e =>
    ['RATIFY', 'VETO'].includes(e.response) && e.syms?.[0] && e.refPrice != null && e.refDate
  )

  if (!graded.length) {
    console.log('No graded pmLedger entries (need response RATIFY/VETO + refPrice/refDate). Nothing to build.')
    return
  }

  const earliestDate = graded.reduce((min, e) => e.refDate < min ? e.refDate : min, graded[0].refDate)
  console.log(`\nDecision Ledger — ${graded.length} graded decisions, earliest ${earliestDate}`)

  console.log('  fetching Nifty (^NSEI)...')
  const niftySeries = await fetchNiftySeries(earliestDate)

  const stockSeries = {}
  const decisions = []

  for (const e of graded) {
    const sym = e.syms[0]
    const isSell = ['CUT', 'TRIM'].includes(e.type)
    const decision = {
      id: e.id, type: e.type, response: e.response, primarySym: sym,
      syms: e.syms, size: e.size ?? null, decisionDate: e.refDate,
      t30: null, t90: null,
    }

    if (!stockSeries[sym]) {
      process.stdout.write(`  fetching ${sym}... `)
      stockSeries[sym] = await fetchSeries(sym, e.refDate)
      console.log(stockSeries[sym] ? `${stockSeries[sym].length} bars` : 'MISS')
    }
    const series = stockSeries[sym]
    const niftyAtRef = closeOnOrBefore(niftySeries, e.refDate)

    if (!series || niftyAtRef == null) {
      console.warn(`  ⚠ ${e.id}: no price series for ${sym} or Nifty — skipping`)
      decisions.push(decision)
      continue
    }

    for (const [key, horizon] of HORIZONS) {
      const age = daysBetween(e.refDate, ASOF)
      if (age < horizon) continue // not enough time elapsed yet

      const horizonDate = dateAdd(e.refDate, horizon)
      const stockAtH = closeOnOrBefore(series, horizonDate)
      const niftyAtH = closeOnOrBefore(niftySeries, horizonDate)

      if (stockAtH == null || niftyAtH == null) {
        console.warn(`  ⚠ ${e.id}: missing price at ${key} (${horizonDate}) — skipping horizon`)
        continue
      }

      const stockRet = (stockAtH - e.refPrice) / e.refPrice
      const niftyRet = (niftyAtH - niftyAtRef) / niftyAtRef
      const excessRet = stockRet - niftyRet
      const alphaPct = isSell ? -excessRet : excessRet
      const alphaRs = e.size != null ? e.size * alphaPct : null

      decision[key] = {
        stockRet: +stockRet.toFixed(4), niftyRet: +niftyRet.toFixed(4),
        alphaPct: +alphaPct.toFixed(4), alphaRs: alphaRs != null ? +alphaRs.toFixed(0) : null,
      }
    }
    decisions.push(decision)
  }

  const cumulative = {}
  for (const [key] of HORIZONS) {
    const rows = decisions.filter(d => d[key] != null)
    if (!rows.length) { cumulative[key] = { alphaPct: null, alphaRs: null, count: 0 }; continue }
    const alphaRsRows = rows.filter(d => d[key].alphaRs != null)
    cumulative[key] = {
      alphaPct: +(rows.reduce((s, d) => s + d[key].alphaPct, 0) / rows.length).toFixed(4),
      alphaRs: alphaRsRows.length ? Math.round(alphaRsRows.reduce((s, d) => s + d[key].alphaRs, 0)) : null,
      count: rows.length,
    }
  }

  const out = { generatedAt: new Date().toISOString(), asOf: ASOF, decisions, cumulative }
  fs.writeFileSync(path.join(D, 'decision-ledger.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(`\nWritten → src/data/decision-ledger.json (${decisions.length} decisions, t30 n=${cumulative.t30.count}, t90 n=${cumulative.t90.count})`)
}

main().catch(err => { console.error(err); process.exit(1) })
