// P2.4 Filings Engine — pure functions for "What Changed" layer
// Consumes cached filings.json (written by Vite plugin) and thesis ledger

import { normalizeFilingDate } from './date'

const CATEGORY_MAP = {
  'Financial Results':          'earnings',
  'Board Meeting':              'board',
  'AGM/EGM':                    'agm',
  'Dividend':                   'corporate_action',
  'Bonus':                      'corporate_action',
  'Stock Split':                'corporate_action',
  'Rights Issue':               'corporate_action',
  'Buy Back':                   'corporate_action',
  'Insider Trading / SAST':     'insider',
  'Shareholding':               'shareholding',
  'Credit Rating':              'rating',
  'Analyst / Investor Meet':    'management',
  'Outcome of Board Meeting':   'board'
}

const IMPORTANCE = {
  earnings:         'high',
  board:            'high',
  insider:          'high',
  rating:           'high',
  agm:              'medium',
  corporate_action: 'medium',
  shareholding:     'medium',
  management:       'low',
  general:          'low'
}

export function categoriseFiling(rawCategory) {
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (rawCategory?.toLowerCase().includes(key.toLowerCase())) return cat
  }
  return 'general'
}

export function importanceOf(category) {
  return IMPORTANCE[category] || 'low'
}

// Returns filings for a symbol that occurred after a given date, ranked by importance
export function getFilingsSince(filings, sym, sinceDate) {
  const symFilings = filings?.holdings?.[sym]?.filings
  if (!symFilings?.length) return []

  const since = new Date(sinceDate)
  return symFilings
    .filter(f => { const d = normalizeFilingDate(f.date); return d && new Date(d) > since })
    .sort((a, b) => {
      const impOrder = { high: 0, medium: 1, low: 2 }
      return impOrder[a.importance] - impOrder[b.importance] || new Date(normalizeFilingDate(b.date)) - new Date(normalizeFilingDate(a.date))
    })
}

// Core P2.4 function: for each position with a logged thesis entry, returns
// what changed in the filing environment since thesis was logged.
// Output is ready to render in morning brief "What Changed" layer.
export function computeWhatChanged(filings, thesisLedger, holdings) {
  if (!filings?.holdings || !thesisLedger?.length) return []

  const holdingSet = new Set(holdings.map(h => h.sym))

  return thesisLedger
    .filter(entry => holdingSet.has(entry.sym))
    .map(entry => {
      const since     = getFilingsSince(filings, entry.sym, entry.date)
      const highSignal = since.filter(f => f.importance === 'high')
      return {
        sym:         entry.sym,
        thesisDate:  entry.date,
        thesis:      entry.thesis,
        filingsSince: since,
        highSignalCount: highSignal.length,
        latestFiling: since[0] ?? null
      }
    })
    .filter(r => r.filingsSince.length > 0)
    .sort((a, b) => b.highSignalCount - a.highSignalCount)
}

// Returns positions with no filings since thesis was logged — "quiet positions"
export function computeQuietPositions(filings, thesisLedger, holdings) {
  const holdingSet = new Set(holdings.map(h => h.sym))
  const withChanges = new Set(
    computeWhatChanged(filings, thesisLedger, holdings).map(r => r.sym)
  )

  return thesisLedger
    .filter(entry => holdingSet.has(entry.sym) && !withChanges.has(entry.sym))
    .map(entry => ({ sym: entry.sym, thesisDate: entry.date }))
}
