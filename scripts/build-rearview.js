/**
 * build-rearview.js — the investor rearview engine.
 *
 * Parses every Zerodha tradebook CSV in data/tradebook/, FIFO-matches sells
 * against buys per symbol to reconstruct round-trips, then computes the
 * performance + behavioral analytics that actually move an investor's returns:
 *   - lifetime scorecard (realized P&L, win rate, profit factor, expectancy)
 *   - estimated cost drag (STT/charges) as a share of gross profit
 *   - trader-vs-investor proof (win rate & return by holding period)
 *   - year-by-year improvement trajectory (are you learning?)
 *   - biggest individual decisions (best & worst round-trips)
 *   - the round-tripping "indecision tax"
 *   - derived personal rules
 *
 * Output: src/data/rearview.json (compact aggregates — never the raw 5k trades).
 * Usage: node scripts/build-rearview.js [--dry-run]
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TRADEBOOK_DIR = path.join(__dirname, '..', 'data', 'tradebook')
const OUT_PATH      = path.join(__dirname, '..', 'src', 'data', 'rearview.json')
const DRY_RUN = process.argv.includes('--dry-run')

// Zerodha delivery-equity cost model (estimate): STT 0.1%/side + exchange txn +
// stamp + GST ≈ 0.11% of traded value, plus ~₹15 DP charge per sell scrip.
const COST_RATE_PER_TURNOVER = 0.0011
const DP_PER_SELL = 15

function parseTrades() {
  const files = fs.readdirSync(TRADEBOOK_DIR).filter(f => f.endsWith('.csv'))
  const trades = []
  for (const file of files) {
    const lines = fs.readFileSync(path.join(TRADEBOOK_DIR, file), 'utf8').trim().split('\n')
    const header = lines[0].split(',')
    const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
    for (const line of lines.slice(1)) {
      const c = line.split(',')
      if (c.length < header.length) continue
      trades.push({
        symbol:   c[idx.symbol].trim(),
        exchange: c[idx.exchange]?.trim() || 'NSE',
        date:     c[idx.trade_date].trim(),
        type:     c[idx.trade_type].trim(),
        qty:      parseFloat(c[idx.quantity]),
        price:    parseFloat(c[idx.price]),
        time:     c[idx.order_execution_time].trim(),
      })
    }
  }
  trades.sort((a, b) => a.time.localeCompare(b.time))
  return trades
}

const fyOf = (d) => { const x = new Date(d); const y = x.getFullYear(); return (x.getMonth() + 1) >= 4 ? `FY${y + 1}` : `FY${y}` }
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000))
const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f }
const avg = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : 0
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0)

function buildRoundTrips(trades) {
  const lots = {}
  const legs = []
  let oversold = 0
  for (const t of trades) {
    if (t.type === 'buy') {
      (lots[t.symbol] ||= []).push({ qty: t.qty, price: t.price, date: t.date })
    } else if (t.type === 'sell') {
      let rem = t.qty
      const q = lots[t.symbol] ||= []
      while (rem > 0 && q.length > 0) {
        const lot = q[0]
        const m = Math.min(rem, lot.qty)
        legs.push({
          symbol: t.symbol, qty: m,
          buyPrice: lot.price, sellPrice: t.price,
          buyDate: lot.date, sellDate: t.date,
          holdDays: daysBetween(lot.date, t.date),
          pnl: (t.price - lot.price) * m,
          pnlPct: (t.price - lot.price) / lot.price,
          fy: fyOf(t.date),
        })
        lot.qty -= m; rem -= m
        if (lot.qty <= 1e-6) q.shift()
      }
      if (rem > 1e-4) oversold += rem
    }
  }
  const open = []
  for (const [symbol, q] of Object.entries(lots)) {
    const qty = q.reduce((a, l) => a + l.qty, 0)
    if (qty > 1e-4) open.push({ symbol, qty: round(qty, 2) })
  }
  return { legs, open, oversold }
}

// Win rate + return by holding-period bucket — the trader-vs-investor proof.
function holdBuckets(legs) {
  const defs = [
    { label: '< 1 week', min: 0,   max: 7 },
    { label: '1w–1m',    min: 7,   max: 30 },
    { label: '1–3 mo',   min: 30,  max: 90 },
    { label: '3–12 mo',  min: 90,  max: 365 },
    { label: '> 1 year', min: 365, max: Infinity },
  ]
  return defs.map(d => {
    const inB = legs.filter(l => l.holdDays >= d.min && l.holdDays < d.max)
    const w = inB.filter(l => l.pnl > 0)
    return {
      label: d.label,
      trades: inB.length,
      winRate: inB.length ? round(w.length / inB.length * 100, 0) : 0,
      avgPct: round(avg(inB, l => l.pnlPct) * 100, 1),
      pnl: round(sum(inB, l => l.pnl)),
    }
  })
}

function byFYTrajectory(legs) {
  const out = {}
  for (const l of legs) (out[l.fy] ||= []).push(l)
  return Object.entries(out).sort().map(([fy, ls]) => {
    const w = ls.filter(l => l.pnl > 0)
    return {
      fy, trades: ls.length,
      winRate: round(w.length / ls.length * 100, 0),
      avgHoldDays: round(avg(ls, l => l.holdDays)),
      pnl: round(sum(ls, l => l.pnl)),
    }
  })
}

function main() {
  const trades = parseTrades()
  const buys = trades.filter(t => t.type === 'buy')
  const sells = trades.filter(t => t.type === 'sell')
  const { legs, open, oversold } = buildRoundTrips(trades)

  const wins = legs.filter(l => l.pnl > 0)
  const losses = legs.filter(l => l.pnl < 0)
  const grossWin = sum(wins, l => l.pnl)
  const grossLoss = Math.abs(sum(losses, l => l.pnl))
  const totalPnL = grossWin - grossLoss
  const turnover = sum(trades, t => t.qty * t.price)
  const costDrag = turnover * COST_RATE_PER_TURNOVER + sells.length * DP_PER_SELL

  const byFY = {}
  for (const l of legs) byFY[l.fy] = (byFY[l.fy] || 0) + l.pnl
  Object.keys(byFY).forEach(k => byFY[k] = round(byFY[k]))

  // Per-stock consolidated ledger — every trade in a name rolled into one line
  const openSet = new Set(open.map(o => o.symbol))
  const bySym = {}
  for (const l of legs) {
    const s = bySym[l.symbol] ||= { symbol: l.symbol, pnl: 0, trips: 0, wins: 0, holdSum: 0, qty: 0 }
    s.pnl += l.pnl; s.trips++; if (l.pnl > 0) s.wins++; s.holdSum += l.holdDays; s.qty += l.qty
  }
  const stockLedger = Object.values(bySym).map(s => ({
    symbol: s.symbol,
    pnl: round(s.pnl),
    trips: s.trips,
    winRate: round(s.wins / s.trips * 100),
    avgHoldDays: round(s.holdSum / s.trips),
    stillHeld: openSet.has(s.symbol),
  })).sort((a, b) => b.pnl - a.pnl)
  const symList = stockLedger // already sorted by pnl desc

  // ── Counterfactuals: what holding would have done vs selling ──
  const exchangeOf = {}
  for (const t of trades) if (!exchangeOf[t.symbol]) exchangeOf[t.symbol] = t.exchange
  const sellAgg = {}
  for (const t of trades) if (t.type === 'sell') {
    const s = sellAgg[t.symbol] ||= { qty: 0, val: 0, lastDate: t.date }
    s.qty += t.qty; s.val += t.qty * t.price; if (t.date > s.lastDate) s.lastDate = t.date
  }

  // Closed (fully exited) positions, ranked by exit value — the fetch target list
  const closedPositions = stockLedger
    .filter(s => !s.stillHeld && sellAgg[s.symbol])
    .map(s => ({ symbol: s.symbol, exchange: exchangeOf[s.symbol], qtySold: round(sellAgg[s.symbol].qty), avgExit: round(sellAgg[s.symbol].val / sellAgg[s.symbol].qty, 2), exitValue: round(sellAgg[s.symbol].val), lastExit: sellAgg[s.symbol].lastDate, realized: s.pnl }))
    .sort((a, b) => b.exitValue - a.exitValue)
    .slice(0, 50)

  // Price cache (refreshed from Kite by enrich-counterfactuals); compute deltas
  let priceCache = {}
  try { priceCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'counterfactual-prices.json'), 'utf8')).prices || {} } catch {}
  const counterfactuals = closedPositions
    .filter(c => priceCache[c.symbol] != null)
    .map(c => {
      const now = priceCache[c.symbol]
      return {
        symbol: c.symbol, qtySold: c.qtySold, avgExit: c.avgExit, now: round(now, 2),
        sinceExitPct: round((now - c.avgExit) / c.avgExit * 100, 1),
        leftOnTable: round((now - c.avgExit) * c.qtySold),
        realized: c.realized, lastExit: c.lastExit,
      }
    })
    .sort((a, b) => b.leftOnTable - a.leftOnTable)
  const whatIfHeld = {
    pricedExits: counterfactuals.length,
    totalLeftOnTable: round(counterfactuals.reduce((a, c) => a + c.leftOnTable, 0)),
    realizedOnThose: round(counterfactuals.reduce((a, c) => a + c.realized, 0)),
  }

  // P&L concentration (Pareto) — how few names drive everything
  const winnersL = stockLedger.filter(s => s.pnl > 0)
  const losersL = stockLedger.filter(s => s.pnl < 0)
  const top5Win = winnersL.slice(0, 5).reduce((a, s) => a + s.pnl, 0)
  const top5Loss = losersL.slice(-5).reduce((a, s) => a + s.pnl, 0)
  const concentration = {
    profitableStocks: winnersL.length,
    losingStocks: losersL.length,
    top5WinnersPnl: round(top5Win),
    top5WinnersPctOfGrossWin: round(top5Win / Math.max(grossWin, 1) * 100),
    top5LosersPnl: round(top5Loss),
    top5LosersPctOfGrossLoss: round(Math.abs(top5Loss) / Math.max(grossLoss, 1) * 100),
  }

  // Biggest individual round-trips (visceral, specific)
  const legSummary = l => ({
    symbol: l.symbol, pnl: round(l.pnl), pnlPct: round(l.pnlPct * 100, 1),
    holdDays: l.holdDays, buyDate: l.buyDate, sellDate: l.sellDate,
  })
  const sortedByPnl = [...legs].sort((a, b) => b.pnl - a.pnl)
  const biggestWins = sortedByPnl.slice(0, 6).map(legSummary)
  const biggestLosses = sortedByPnl.slice(-6).reverse().map(legSummary)

  // Round-tripping: re-entries + the indecision tax (sold then rebought higher)
  const reentry = {}, state = {}, held = {}
  for (const t of trades) {
    held[t.symbol] = (held[t.symbol] || 0) + (t.type === 'buy' ? t.qty : -t.qty)
    if (t.type === 'buy' && (state[t.symbol] || 'flat') === 'flat') {
      state[t.symbol] = 'in'; reentry[t.symbol] = (reentry[t.symbol] || 0) + 1
    }
    if (held[t.symbol] <= 1e-4) state[t.symbol] = 'flat'
  }
  const roundTrippers = Object.entries(reentry).filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([symbol, entries]) => ({ symbol, entries }))

  const months = Math.max(1, daysBetween(trades[0].date, trades.at(-1).date) / 30.44)
  const quickFlips = legs.filter(l => l.holdDays < 30).length

  const buckets = holdBuckets(legs)
  const trajectory = byFYTrajectory(legs)

  // ── Derived personal rules (data-driven) ──
  const longBucket = buckets.find(b => b.label === '> 1 year')
  const tradeWindowPnl = sum(buckets.filter(b => ['1–3 mo', '3–12 mo'].includes(b.label)), b => b.pnl)
  const rules = []
  // The headline: investor-makes / trader-loses
  if (longBucket && longBucket.pnl > 0 && tradeWindowPnl < 0) {
    rules.push(`Holding >1yr made ₹${(longBucket.pnl/1e5).toFixed(2)}L; trading the 1–12mo window LOST ₹${(Math.abs(tradeWindowPnl)/1e5).toFixed(2)}L. You make money as an investor and bleed it as a trader — the fix is to do nothing in the 1–12mo window.`)
  }
  if (grossLoss > grossWin * 0.8) {
    rules.push(`A few fat-tail losers (${biggestLosses.slice(0,2).map(l=>l.symbol).join(', ')}) erased years of gains. Cut broken theses fast — that's the whole game.`)
  }
  if (roundTrippers.length) {
    rules.push(`You round-tripped ${roundTrippers[0].symbol} ${roundTrippers[0].entries}× and re-bought future winners higher. Conviction names are held, not traded around.`)
  }
  if (turnover > 0 && costDrag / Math.max(totalPnL, 1) > 0.15) {
    rules.push(`Costs ate ~${round(costDrag / Math.max(totalPnL, 1) * 100)}% of net realized profit. Every trade pays a toll to the exchange — trade less.`)
  }

  const rearview = {
    generatedAt: new Date().toISOString(),
    span: {
      firstTrade: trades[0].date, lastTrade: trades.at(-1).date,
      years: round(daysBetween(trades[0].date, trades.at(-1).date) / 365, 1),
    },
    activity: {
      totalTrades: trades.length, buys: buys.length, sells: sells.length,
      symbolsTraded: new Set(trades.map(t => t.symbol)).size,
      turnover: round(turnover), tradesPerMonth: round(trades.length / months, 1),
      quickFlipShare: round(quickFlips / legs.length * 100),
    },
    realized: {
      totalPnL: round(totalPnL), roundTrips: legs.length,
      wins: wins.length, losses: losses.length,
      winRate: round(wins.length / (legs.length || 1) * 100, 1),
      grossWin: round(grossWin), grossLoss: round(grossLoss),
      profitFactor: round(grossWin / Math.max(grossLoss, 1), 2),
      expectancy: round(totalPnL / (legs.length || 1)),
      avgWinValue: round(avg(wins, l => l.pnl)), avgLossValue: round(avg(losses, l => l.pnl)),
      avgWinPct: round(avg(wins, l => l.pnlPct) * 100, 1), avgLossPct: round(avg(losses, l => l.pnlPct) * 100, 1),
      byFY,
    },
    costDrag: {
      estimated: round(costDrag),
      pctOfGrossWin: round(costDrag / Math.max(grossWin, 1) * 100, 1),
      pctOfNet: round(costDrag / Math.max(totalPnL, 1) * 100),
      assumptions: `~${COST_RATE_PER_TURNOVER * 100}% of turnover + ₹${DP_PER_SELL}/sell (Zerodha delivery est.)`,
    },
    holdingPeriods: {
      avgWinnerDays: round(avg(wins, l => l.holdDays)),
      avgLoserDays: round(avg(losses, l => l.holdDays)),
      avgOverallDays: round(avg(legs, l => l.holdDays)),
      buckets,
    },
    trajectory,
    topWinners: symList.slice(0, 8).map(s => ({ symbol: s.symbol, pnl: round(s.pnl) })),
    topLosers: symList.slice(-8).reverse().map(s => ({ symbol: s.symbol, pnl: round(s.pnl) })),
    concentration,
    stockLedger,
    counterfactuals,
    whatIfHeld,
    closedPositions,
    biggestWins, biggestLosses,
    roundTrippers,
    rules,
    openPositions: open.length,
    oversoldShares: round(oversold),
  }

  if (!DRY_RUN) fs.writeFileSync(OUT_PATH, JSON.stringify(rearview, null, 2))

  const r = rearview
  console.log(`\n══════════ INVESTOR REARVIEW ══════════`)
  console.log(`${r.span.firstTrade} → ${r.span.lastTrade} (${r.span.years}y) · ${r.activity.totalTrades} trades · ${r.activity.symbolsTraded} symbols`)
  console.log(`Realized ₹${(r.realized.totalPnL/1e5).toFixed(2)}L · PF ${r.realized.profitFactor} · win ${r.realized.winRate}% · expectancy ₹${r.realized.expectancy}/trip`)
  console.log(`Cost drag est ₹${(r.costDrag.estimated/1e5).toFixed(2)}L = ${r.costDrag.pctOfGrossWin}% of gross wins`)
  console.log(`\nWin rate by hold period:`)
  r.holdingPeriods.buckets.forEach(b => console.log(`  ${b.label.padEnd(10)} ${String(b.trades).padStart(5)} trips · ${b.winRate}% win · ${b.avgPct}% avg · ₹${(b.pnl/1e5).toFixed(2)}L`))
  console.log(`\nTrajectory:`)
  r.trajectory.forEach(t => console.log(`  ${t.fy}: ${t.trades} trips · ${t.winRate}% win · ${t.avgHoldDays}d hold · ₹${(t.pnl/1e5).toFixed(2)}L`))
  console.log(`\nConcentration: ${r.concentration.profitableStocks} winners / ${r.concentration.losingStocks} losers · top-5 winners = ${r.concentration.top5WinnersPctOfGrossWin}% of gross gain · top-5 losers = ${r.concentration.top5LosersPctOfGrossLoss}% of gross loss`)
  console.log(`\nConsolidated P&L by stock (worst 5):`)
  r.stockLedger.slice(-5).reverse().forEach(s => console.log(`  ${s.symbol.padEnd(12)} ₹${(s.pnl/1e5).toFixed(2)}L · ${s.trips} trips · ${s.winRate}% win${s.stillHeld ? ' · still held' : ''}`))
  console.log(`\nDerived rules:`); r.rules.forEach(x => console.log(`  • ${x}`))
  console.log(`\n${DRY_RUN ? '[dry-run]' : '→ src/data/rearview.json'}`)
}

main()
