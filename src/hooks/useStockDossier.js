import { useMemo } from 'react'
import brainIndexData from '../data/brain-index.json'
import benchmarkData  from '../data/benchmark.json'
import newsData       from '../data/news.json'
import fundamentalsData from '../data/fundamentals.json'
import { getBrainEntry, parseDimensions } from '../lib/brainIndexParser'
import { stockAlphaAttribution } from '../lib/attribution'
import { today, daysBetween, normalizeFilingDate, formatDate } from '../lib/date'

/**
 * useStockDossier(sym, { holdings, aiInsights, memory, insightsData, filingsData })
 *
 * Joins all intelligence data sources for a single stock.
 * Imported statics (brain-index.json, benchmark.json) are module-level — no prop needed.
 * Returns null for any field that is absent — never throws.
 *
 * @param {string}  sym
 * @param {Object}  opts.holdings      - enriched HoldingShape[] from usePortfolio
 * @param {Object}  opts.aiInsights    - ai-insights.json content
 * @param {Object}  opts.memory        - memory state (from App.jsx useState)
 * @param {Object}  opts.insightsData  - insights.json content
 * @param {Array}   opts.filingsData   - filings.json array
 */
export function useStockDossier(sym, { holdings = [], aiInsights = {}, memory = {}, insightsData = {}, filingsData = [] } = {}) {
  return useMemo(() => {
    if (!sym) return null

    // ── 1. HOLDING ──
    const holding = holdings.find(h => h.sym === sym) ?? null

    // ── 2. BRAIN ──
    const brainEntry = getBrainEntry(brainIndexData, sym)
    const brain = brainEntry ? {
      thesis:    brainEntry.thesis ?? null,
      bullCase:  brainEntry.bullCase ?? null,
      bearCase:  brainEntry.bearCase ?? null,
      dimensions: parseDimensions(brainEntry.convictionBreakdown),
      // thesisBreakers is a useful "bear case" proxy when bearCase is absent
      thesisBreakers: brainEntry.thesisBreakers ?? null,
    } : null

    // ── 3. AI STOCK ──
    const aiRaw   = aiInsights?.stocks?.[sym] ?? null
    const aiStock = aiRaw ? {
      // Legacy fields (preserved for backward compat)
      action:     aiRaw.action    ?? null,
      conviction: aiRaw.conviction ?? null,
      summary:    aiRaw.summary   ?? aiRaw.note ?? null,
      keyRisk:    aiRaw.keyRisk   ?? null,
      catalysts:  Array.isArray(aiRaw.catalysts) ? aiRaw.catalysts : [],
      signal:     aiRaw.signal    ?? null,
      lastUpdated: aiRaw.lastUpdated ?? null,
      // Veteran-grade schema v2 — pass through everything the dossier renders
      verdict:           aiRaw.verdict           ?? null,
      thesisOneLiner:    aiRaw.thesisOneLiner    ?? null,
      bullCase:          Array.isArray(aiRaw.bullCase) ? aiRaw.bullCase : null,
      bearCase:          Array.isArray(aiRaw.bearCase) ? aiRaw.bearCase : null,
      earningsQuality:   aiRaw.earningsQuality   ?? null,
      valuation:         aiRaw.valuation         ?? null,
      orderBookSignal:   aiRaw.orderBookSignal   ?? null,
      positionSizing:    aiRaw.positionSizing    ?? null,
      entryZone:         aiRaw.entryZone         ?? null,
      exitZone:          aiRaw.exitZone          ?? null,
      timeHorizon:       aiRaw.timeHorizon       ?? null,
      whatChangesThesis: aiRaw.whatChangesThesis ?? null,
      peerCheck:         aiRaw.peerCheck         ?? null,
      actionCall:        aiRaw.actionCall        ?? null,
      veteranTake:       aiRaw.veteranTake       ?? null,
      preResultsBrief:   aiRaw.preResultsBrief   ?? null,
      asOf:              aiRaw.asOf              ?? null,
    } : null

    // ── 4. THESIS ENTRIES (from thesisLedger) ──
    const thesisEntries = (memory.thesisLedger ?? [])
      .filter(t => t.sym === sym)
      .sort((a, b) => new Date(b.date) - new Date(a.date))

    // ── 5. CONVICTION HISTORY (from convictionLog) ──
    const convictionHistory = (memory.convictionLog ?? memory.convictionDrift ?? [])
      .filter(c => c.sym === sym)
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    // ── 6. TECHNICALS ──
    const techRaw = insightsData?.positions?.[sym]?.computedTechnicals ?? null
    const technicals = techRaw ? {
      rsi14:      techRaw.rsi14    ?? null,
      sma50:      techRaw.sma50    ?? null,
      sma200:     techRaw.sma200   ?? null,
      high52w:    techRaw.fiftyTwoWeekHigh ?? null,
      low52w:     techRaw.fiftyTwoWeekLow  ?? null,
      support:    techRaw.support    ?? null,
      resistance: techRaw.resistance ?? null,
    } : null

    // ── 7. FILINGS ──
    // filings.json shape: { holdings: { SYM: { bseCode, filings[] } } }
    // Fall back to flat array format for backwards compat
    const rawFilings = filingsData?.holdings?.[sym]?.filings
      ?? (Array.isArray(filingsData) ? filingsData.filter(f => f.sym === sym || f.symbol === sym) : [])
    const filings = rawFilings
      .map(f => ({ ...f, _iso: normalizeFilingDate(f.date) }))
      .filter(f => f._iso)                                   // drop unparseable dates
      .sort((a, b) => new Date(b._iso) - new Date(a._iso))
      .slice(0, 10)
      .map(f => ({ date: formatDate(f._iso), type: f.type || f.category || '', title: f.title || f.subject || '' }))

    // ── 8. CATALYSTS ──
    const catalysts = (aiInsights?.catalystAlerts ?? [])
      .filter(c => Array.isArray(c.stocks) && c.stocks.includes(sym))
      .slice(0, 5)
      .map(c => ({ date: c.date, event: c.event, risk: c.risk, portfolioAction: c.portfolioAction || '' }))

    // ── 9. ALPHA CONTRIBUTION ──
    const attribution = stockAlphaAttribution(holdings, benchmarkData, 'ytd')
    const alphaEntry  = attribution.find(a => a.sym === sym)
    const alphaContribution = alphaEntry?.contribution ?? null

    // ── 10. THESIS AGE ──
    let thesisAgeDays   = null
    let thesisNeedsRefresh = false
    if (thesisEntries.length > 0) {
      const latest = thesisEntries[0]
      const refDate = latest.lastRefreshed ?? latest.date
      thesisAgeDays = daysBetween(refDate, today())
      thesisNeedsRefresh = thesisAgeDays > 90
    }

    // ── 11. PEERS (same theme) ──
    const myTheme = holding?.theme ?? null
    const peers = myTheme
      ? holdings
          .filter(h => h.sym !== sym && h.theme === myTheme)
          .map(h => ({ sym: h.sym, name: h.name ?? h.sym, bucket: h.bucket, conv: h.conv, pnlPct: h.pnlPct, value: h.value }))
          .sort((a, b) => b.value - a.value)
      : []

    // ── 13. FUNDAMENTALS (Screener teardown: grade, verdict, metrics, red flags) ──
    const fundamentals = fundamentalsData?.stocks?.[sym] ?? null

    // ── 12. NEWS (recent headlines + rating signals) ──
    const newsRaw = newsData?.stocks?.[sym] ?? null
    const news = newsRaw ? {
      headlines:     (newsRaw.headlines ?? []).slice(0, 6),
      ratingSignals: newsRaw.ratingSignals ?? [],
      fetchedAt:     newsData.fetchedAt ?? null,
    } : null

    return {
      holding,
      brain,
      aiStock,
      thesisEntries,
      convictionHistory,
      technicals,
      filings,
      catalysts,
      alphaContribution,
      thesisAgeDays,
      thesisNeedsRefresh,
      peers,
      news,
      fundamentals,
    }
  }, [sym, holdings, aiInsights, memory, insightsData, filingsData])
}
