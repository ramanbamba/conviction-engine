/**
 * breakoutSignals.js — the 12-signal pre-breakout engine (Screener tab).
 *
 * Inspired by the clustering study of NSE pre-rally setups (price coiling near
 * 52w highs on drying volume while OBV shows quiet accumulation), rebuilt as a
 * WEIGHTED composite instead of an all-or-nothing 12/12 filter: each signal
 * carries a weight summing to 100, so names rank by setup strength and you can
 * see exactly which legs of the pattern are in place. Pure price/volume — the
 * fundamentals cross-check happens downstream in screen-breakouts.js against
 * the AlphaModel/OpportunityRadar grades.
 *
 * Input: 1y of daily candles [{date, open, high, low, close, volume}].
 */

function linSlope(vals) {
  const n = vals.length
  if (n < 2) return 0
  const xm = (n - 1) / 2
  const ym = vals.reduce((s, v) => s + v, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (i - xm) * (vals[i] - ym); den += (i - xm) ** 2 }
  return den ? num / den : 0
}

function rsiAt(closes, endIdx, period = 14) {
  if (endIdx < period) return null
  let gains = 0, losses = 0
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    const ch = closes[i] - closes[i - 1]
    if (ch > 0) gains += ch
    else losses -= ch
  }
  if (losses === 0) return 100
  return 100 - 100 / (1 + gains / losses)
}

const r1 = (n) => (n == null ? null : Number(n.toFixed(1)))
const r2 = (n) => (n == null ? null : Number(n.toFixed(2)))

/**
 * Returns { score, signals: [{id, label, pass, weight, detail}], metrics, class }
 * class: BREAKOUT_READY | BASE_BUILDING | NEUTRAL | DISTRESSED
 */
export function computeBreakoutSignals(candles) {
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const vols = candles.map(c => c.volume ?? 0)
  const n = closes.length
  const last = closes[n - 1]

  const sma = (p) => (n >= p ? closes.slice(-p).reduce((s, v) => s + v, 0) / p : null)
  const sma20 = sma(20), sma50 = sma(50), sma200 = sma(200)

  const high52 = Math.max(...highs)
  const low52 = Math.min(...lows)
  const fromHighPct = (last / high52 - 1) * 100

  // ATR14 % — leverage survivability input for the futures desk
  let trSum = 0, trN = 0
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
    trSum += tr; trN++
  }
  const atr = trN ? trSum / trN : null
  const atrPct = atr != null ? (atr / last) * 100 : null

  // RSI series over the last 20 sessions
  const rsiSeries = []
  for (let i = Math.max(14, n - 20); i < n; i++) rsiSeries.push(rsiAt(closes, i))
  const rsi14 = rsiSeries[rsiSeries.length - 1] ?? null

  // Volume windows
  const vol20 = n >= 20 ? vols.slice(-20).reduce((s, v) => s + v, 0) / 20 : null
  const volBase = n >= 80 ? vols.slice(-80, -20).reduce((s, v) => s + v, 0) / 60 : null
  let upVol = 0, dnVol = 0
  for (let i = Math.max(1, n - 20); i < n; i++) {
    if (closes[i] > closes[i - 1]) upVol += vols[i]
    else if (closes[i] < closes[i - 1]) dnVol += vols[i]
  }
  const upDownRatio = dnVol > 0 ? upVol / dnVol : (upVol > 0 ? 3 : 1)

  // OBV over the last 60 sessions
  const obv = [0]
  for (let i = Math.max(1, n - 60); i < n; i++) {
    const prev = obv[obv.length - 1]
    obv.push(prev + (closes[i] > closes[i - 1] ? vols[i] : closes[i] < closes[i - 1] ? -vols[i] : 0))
  }
  const obvSlope = linSlope(obv)
  const avgVol60 = obv.length > 1 ? vols.slice(-60).reduce((s, v) => s + v, 0) / Math.min(60, n) : 0

  // 20d consolidation band + higher-lows structure
  const band20 = n >= 20 ? (Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20))) / last * 100 : null
  const lowsSlope = n >= 20 ? linSlope(lows.slice(-20)) : 0
  const ret60 = n >= 61 ? (last / closes[n - 61] - 1) * 100 : null

  const rangePos = high52 > low52 ? (last - low52) / (high52 - low52) : 0
  const rsiAbove50Frac = rsiSeries.length ? rsiSeries.filter(v => v != null && v > 50).length / rsiSeries.length : 0
  const rsiSlope = linSlope(rsiSeries.slice(-10).filter(v => v != null))
  const maAligned = sma20 != null && sma50 != null && sma200 != null && last > sma20 && sma20 > sma50 && sma50 > sma200
  const volContraction = vol20 != null && volBase > 0 ? vol20 / volBase : null

  const signals = [
    { id: 'rangePos',    label: 'Upper 52w range',      weight: 10, pass: rangePos >= 0.70,
      detail: `${Math.round(rangePos * 100)}% of yearly range` },
    { id: 'tightBand',   label: 'Tight 20d coil',       weight: 10, pass: band20 != null && band20 <= 13,
      detail: band20 != null ? `20d band ${r1(band20)}%` : 'insufficient data' },
    { id: 'higherLows',  label: 'Higher lows',          weight: 8,  pass: lowsSlope > 0,
      detail: lowsSlope > 0 ? 'support rising' : 'support flat/falling' },
    { id: 'maAligned',   label: 'MA stack P>20>50>200', weight: 12, pass: maAligned,
      detail: maAligned ? 'fully aligned' : 'not aligned' },
    { id: 'rsiSweet',    label: 'RSI sweet spot',       weight: 8,  pass: rsi14 != null && rsi14 >= 45 && rsi14 <= 68,
      detail: `RSI ${r1(rsi14) ?? '—'}` },
    { id: 'rsiPersist',  label: 'RSI held >50',         weight: 6,  pass: rsiAbove50Frac >= 0.7,
      detail: `${Math.round(rsiAbove50Frac * 100)}% of last 20d` },
    { id: 'rsiRising',   label: 'RSI rising',           weight: 6,  pass: rsiSlope > 0,
      detail: `slope ${r2(rsiSlope)}/day` },
    { id: 'volDryUp',    label: 'Volume dry-up',        weight: 10, pass: volContraction != null && volContraction <= 0.85,
      detail: volContraction != null ? `20d vol ${Math.round(volContraction * 100)}% of base` : 'no volume data' },
    { id: 'accumRatio',  label: 'Up-day volume bias',   weight: 8,  pass: upDownRatio >= 1.15,
      detail: `up/down vol ${r2(upDownRatio)}×` },
    { id: 'obvRising',   label: 'OBV accumulation',     weight: 10, pass: avgVol60 > 0 && obvSlope > 0,
      detail: avgVol60 > 0 ? (obvSlope > 0 ? 'OBV rising 60d' : 'OBV falling 60d') : 'no volume data' },
    { id: 'healthyBase', label: 'Basing near high',     weight: 6,  pass: fromHighPct >= -15,
      detail: `${r1(fromHighPct)}% from 52w high` },
    { id: 'trend3mo',    label: '3-month uptrend',      weight: 6,  pass: ret60 != null && ret60 > 0,
      detail: ret60 != null ? `${ret60 > 0 ? '+' : ''}${r1(ret60)}% over 60 sessions` : 'insufficient data' },
  ]

  const score = signals.reduce((s, sig) => s + (sig.pass ? sig.weight : 0), 0)

  let cls = 'NEUTRAL'
  const distressed = sma200 != null && last < sma200 && (rsi14 ?? 50) < 45 && (ret60 ?? 0) < 0
  if (distressed) cls = 'DISTRESSED'
  else if (score >= 70 && maAligned && rangePos >= 0.70) cls = 'BREAKOUT_READY'
  else if (score >= 45) cls = 'BASE_BUILDING'

  return {
    score,
    class: cls,
    signals,
    metrics: {
      ltp: r2(last), rsi14: r1(rsi14), atrPct: r2(atrPct),
      fromHighPct: r1(fromHighPct), rangePos: r2(rangePos), band20Pct: r1(band20),
      volContraction: r2(volContraction), upDownVolRatio: r2(upDownRatio),
      sma20: r2(sma20), sma50: r2(sma50), sma200: r2(sma200),
      high52: r2(high52), low52: r2(low52), ret60Pct: r1(ret60),
      support20: r2(Math.min(...lows.slice(-20))),
    },
  }
}
