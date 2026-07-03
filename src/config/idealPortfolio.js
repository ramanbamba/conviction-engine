/**
 * idealPortfolio.js — the directional allocation compass.
 *
 * NOT a hard ₹ target. A %-based ideal shape that says where new money *leans*
 * whenever it arrives, while the immediate game stays optimizing what's held.
 * Anchor: 50% Core (advisor model) / 50% growth + hedge. the reference corpus is just a
 * reference for translating % into rupees — the book can grow past it.
 */

export const IDEAL_PORTFOLIO = {
  referenceCorpus: 10000000, // the reference corpus — directional reference only
  note: '50% Platinum model / 50% growth & hedge. Directional, not a hard target.',
  // Top-level intent: half in the locked advisor model, half everywhere else
  buckets: {
    Platinum:      { pct: 0.50, group: 'model',  label: 'Core (advisor model)' },
    Stars:         { pct: 0.20, group: 'growth', label: 'Stars (multibaggers)' },
    'Power Alpha': { pct: 0.10, group: 'growth', label: 'Power Alpha' },
    Compounders:   { pct: 0.10, group: 'growth', label: 'Compounders' },
    Hedge:         { pct: 0.06, group: 'hedge',  label: 'Hedge (gold + silver)' },
    Cash:          { pct: 0.02, group: 'hedge',  label: 'Cash (crash buffer)' },
    Satellites:    { pct: 0.02, group: 'satellite', label: 'Satellites (ETFs)' },
  },
}

// Bucket display order for the compass
export const IDEAL_ORDER = ['Platinum', 'Stars', 'Power Alpha', 'Compounders', 'Hedge', 'Cash', 'Satellites']
