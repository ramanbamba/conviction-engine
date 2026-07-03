/**
 * brainIndexParser.js
 * Utilities for reading brain-index.json in components/hooks.
 *
 * brain-index.json sym keys don't always match portfolio.json syms:
 *   'DIXON TECHNOLOGIES' → 'DIXON'
 *   'L&T'               → 'LT'
 *   'GOLDBEES + SILVERBEES' → 'GOLDBEES' and 'SILVERBEES'
 */

// Map portfolio.json sym → brain-index.json key
const BRAIN_SYM_MAP = {
  DIXON:       'DIXON TECHNOLOGIES',
  LT:          'L&T',
  GOLDBEES:    'GOLDBEES + SILVERBEES',
  SILVERBEES:  'GOLDBEES + SILVERBEES',
  BALRAMCHIN:  'BALRAMCHIN',
  GOKEX:       'GOKEX',
}

/**
 * Look up a brain-index entry by portfolio sym.
 * Returns null if not found.
 */
export function getBrainEntry(brainIndex, portfolioSym) {
  if (!brainIndex?.stocks) return null
  const brainKey = BRAIN_SYM_MAP[portfolioSym] ?? portfolioSym
  return brainIndex.stocks[brainKey] ?? null
}

/**
 * Parse the convictionBreakdown string into a structured 10-dim object.
 *
 * Input:  "8, BS:10, Mgmt:8, Val:9, OB:9, Moat:8, Cat:8, DP:9, ST:9, Gov:9"
 * Output: { earningsGrowth:8, balanceSheet:10, mgmtQuality:8, ... }
 *
 * Returns null if input is falsy or unparseable.
 */
const DIM_KEY_MAP = {
  BS:   'balanceSheet',
  Mgmt: 'mgmtQuality',
  Val:  'valuationHeadroom',
  OB:   'orderBookVisibility',
  Moat: 'competitiveMoat',
  Cat:  'catalystProximity',
  DP:   'downsideProtection',
  ST:   'sectorTailwind',
  Gov:  'governance',
}

export function parseDimensions(convictionBreakdown) {
  if (!convictionBreakdown || typeof convictionBreakdown !== 'string') return null

  const result = {
    earningsGrowth:      null,
    balanceSheet:        null,
    mgmtQuality:         null,
    valuationHeadroom:   null,
    orderBookVisibility: null,
    competitiveMoat:     null,
    catalystProximity:   null,
    downsideProtection:  null,
    sectorTailwind:      null,
    governance:          null,
  }

  // Strip anything after → (e.g. "→ **92/100 → 9.2**")
  const clean = convictionBreakdown.split('→')[0].trim()
  const parts = clean.split(',').map(s => s.trim())

  parts.forEach((part, i) => {
    if (i === 0) {
      // First part is always earningsGrowth (no label)
      const n = parseFloat(part)
      if (!isNaN(n)) result.earningsGrowth = n
      return
    }
    const [label, val] = part.split(':')
    if (!label || !val) return
    const key = DIM_KEY_MAP[label.trim()]
    if (key) {
      const n = parseFloat(val)
      if (!isNaN(n)) result[key] = n
    }
  })

  return result
}
