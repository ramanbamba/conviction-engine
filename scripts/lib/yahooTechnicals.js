/**
 * yahooTechnicals.js — shared Yahoo Finance chart fetch + technical computation.
 * Extracted from refresh-technicals-yahoo.js so the universe scanner (Sprint D)
 * and the holdings refresher share one implementation. Free, no auth, v8 chart API.
 */

function sma(closes, period) {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  return slice.reduce((s, v) => s + v, 0) / period
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  let gains = 0, losses = 0
  for (let i = changes.length - period; i < changes.length; i++) {
    if (changes[i] > 0) gains += changes[i]
    else losses += Math.abs(changes[i])
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

function fmt(n, decimals = 2) {
  if (n == null) return null
  return Number(n.toFixed(decimals))
}

export async function fetchYahooChart(sym, overrideSym = null, range = '1y') {
  const yahooSym = overrideSym ?? sym
  const exchanges = ['NS', 'BO']
  for (const ex of exchanges) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}.${ex}?range=${range}&interval=1d`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' } })
      if (!res.ok) continue
      const json = await res.json()
      const result = json.chart?.result?.[0]
      if (!result) continue
      const ts = result.timestamp || []
      const q = result.indicators?.quote?.[0]
      if (!ts.length || !q?.close) continue
      const candles = []
      for (let i = 0; i < ts.length; i++) {
        const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]
        if (o == null || h == null || l == null || c == null) continue
        candles.push({ date: new Date(ts[i] * 1000).toISOString().split('T')[0], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? null })
      }
      if (candles.length < 30) continue
      return { exchange: ex, candles }
    } catch { continue }
  }
  return null
}

export function computeTechnicals(candles) {
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const last = closes[closes.length - 1]

  const sma50_v = sma(closes, 50)
  const sma200_v = sma(closes, 200)
  const rsi14_v = rsi(closes, 14)
  const high52w = Math.max(...highs)
  const low52w = Math.min(...lows)

  const lookback = Math.min(60, candles.length)
  const recentHighs = highs.slice(-lookback)
  const recentLows = lows.slice(-lookback)

  return {
    asOf: candles[candles.length - 1].date,
    last: fmt(last),
    sma50: fmt(sma50_v),
    sma200: fmt(sma200_v),
    rsi14: fmt(rsi14_v, 1),
    fiftyTwoWeekHigh: fmt(high52w),
    fiftyTwoWeekLow: fmt(low52w),
    fromHighPct: fmt((last / high52w - 1) * 100, 1),
    fromLowPct: fmt((last / low52w - 1) * 100, 1),
    vsSma50Pct: sma50_v ? fmt((last / sma50_v - 1) * 100, 1) : null,
    vsSma200Pct: sma200_v ? fmt((last / sma200_v - 1) * 100, 1) : null,
    support: fmt(Math.min(...recentLows)),
    resistance: fmt(Math.max(...recentHighs)),
    candleCount: candles.length,
    source: 'yahoo-finance',
  }
}
