/**
 * detect-signals.js
 *
 * Pure JS delta detector — zero AI cost.
 *
 * Compares current portfolio.json against the most recent snapshot to flag
 * stocks that need attention this week. Designed to be imported by sync.js
 * (the unified pipeline) but also runnable standalone for inspection.
 *
 * Signals emitted per stock:
 *   priceMove     — ltp moved ±PRICE_MOVE_PCT% since last snapshot
 *   slProximity   — within SL_PROXIMITY_PCT% of the stop-loss price
 *   catalystNear  — a dated catalyst/monitor event within CATALYST_DAYS days
 *   gapChanged    — gap-to-target changed by more than GAP_CHANGE_INR
 *   newBuy        — todayBuy flag is set (position added today)
 *   convChanged   — conviction score changed since last snapshot
 *
 * Export: detectSignals(opts?) → SignalResult
 * CLI:    node scripts/detect-signals.js [--json]
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const DEFAULTS = {
  portfolioPath:  path.join(ROOT, 'src/data/portfolio.json'),
  snapshotsDir:   path.join(ROOT, 'data/snapshots'),
  brainIndexPath: path.join(ROOT, 'src/data/brain-index.json'),
  insightsPath:   path.join(ROOT, 'src/data/ai-insights.json'),
  signalsOut:     path.join(ROOT, 'src/data/signals.json'),
}

// ─── Thresholds — tune here or override via opts ─────────────────────────────
const DEFAULT_THRESHOLDS = {
  PRICE_MOVE_PCT:    0.06,    // flag if ltp moved ±6% since last snapshot
  SL_PROXIMITY_PCT:  0.05,    // flag if within 5% above stop-loss
  CATALYST_DAYS:     14,      // flag if dated catalyst within 14 calendar days
  GAP_CHANGE_INR:    50000,   // flag if gap-to-target shifted ±₹50K
  // Buckets where SL is a soft/placeholder value — skip SL proximity for these
  SL_SKIP_BUCKETS:  new Set(['Cash', 'Hedge', 'Satellites']),
}

// ─── Date parser ─────────────────────────────────────────────────────────────

const MONTH_IDX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Try to extract a future-or-near date from a free-text monitor/catalyst line.
 * Handles:
 *   "May 14"           → May 14 current year
 *   "~May 28"          → May 28 current year
 *   "May 29, 2026"     → May 29 2026
 *   "March 2027"       → March 1 2027  (month-only, day = 1)
 */
function extractDate(line) {
  const now = new Date()

  // Pattern 1: "Month Day" or "Month Day, Year"  e.g. "May 14" or "May 28, 2026"
  const dayMatch = line.match(
    /~?\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})(?:,?\s*(\d{4}))?/i
  )
  if (dayMatch) {
    const mo  = MONTH_IDX[dayMatch[1].slice(0, 3).toLowerCase()]
    const day = parseInt(dayMatch[2])
    const yr  = dayMatch[3] ? parseInt(dayMatch[3]) : now.getFullYear()
    if (mo !== undefined && day >= 1 && day <= 31) {
      const d = new Date(yr, mo, day)
      // If inferred year lands in the past, try next year
      if (!dayMatch[3] && d < now) d.setFullYear(yr + 1)
      return d
    }
  }

  // Pattern 2: "Month Year"  e.g. "March 2027"
  const moYrMatch = line.match(
    /~?\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})\b/i
  )
  if (moYrMatch) {
    const mo = MONTH_IDX[moYrMatch[1].slice(0, 3).toLowerCase()]
    const yr = parseInt(moYrMatch[2])
    if (mo !== undefined) return new Date(yr, mo, 1)
  }

  return null
}

/** Days between now and a future date. Negative = already past. */
function daysUntil(date) {
  return Math.round((date - new Date()) / 86_400_000)
}

// ─── Snapshot loader ─────────────────────────────────────────────────────────

function loadLatestSnapshot(snapshotsDir) {
  if (!fs.existsSync(snapshotsDir)) return null
  const files = fs.readdirSync(snapshotsDir)
    .filter(f => f.startsWith('portfolio-') && f.endsWith('.json'))
    .sort()
  if (!files.length) return null
  const latest = files[files.length - 1]
  const snap   = JSON.parse(fs.readFileSync(path.join(snapshotsDir, latest), 'utf8'))
  // Parse date from filename: portfolio-YYYYMMDD-HHMMSS.json
  const dateStr = latest.match(/portfolio-(\d{8})/)?.[1] ?? ''
  const snapDate = dateStr
    ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    : null
  return { snap, snapDate, filename: latest }
}

// ─── Catalyst scanner ─────────────────────────────────────────────────────────

/**
 * Collect all dated monitor/catalyst lines for a stock from brain-index
 * and from ai-insights catalystAlerts (if available), then return those
 * within CATALYST_DAYS days of today.
 */
function findNearCatalysts(sym, brainEntry, insightCatalysts, thresholdDays) {
  const hits = []

  const lines = [
    ...(brainEntry?.activeMonitors ?? []),
    ...(brainEntry?.catalysts      ?? []),
  ]

  for (const line of lines) {
    const d = extractDate(line)
    if (!d) continue
    const days = daysUntil(d)
    if (days >= -1 && days <= thresholdDays) {  // -1 allows "yesterday" results
      hits.push({ days, label: line.replace(/\*\*/g, '').slice(0, 100) })
    }
  }

  // Also check ai-insights catalystAlerts for this sym
  for (const alert of insightCatalysts) {
    if ((alert.stock ?? alert.sym ?? '').toUpperCase() !== sym) continue
    const d = extractDate(alert.date ?? alert.label ?? '')
    if (!d) continue
    const days = daysUntil(d)
    if (days >= -1 && days <= thresholdDays) {
      hits.push({ days, label: (alert.label ?? alert.event ?? alert.date ?? '').slice(0, 100) })
    }
  }

  // Deduplicate by day (keep shortest label for each day — most concise)
  const byDay = new Map()
  for (const h of hits) {
    const existing = byDay.get(h.days)
    if (!existing || h.label.length < existing.label.length) byDay.set(h.days, h)
  }
  return [...byDay.values()].sort((a, b) => a.days - b.days)
}

// ─── Core detector ────────────────────────────────────────────────────────────

export function detectSignals(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts }
  const rawT = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds ?? {}) }
  // Normalise SL_SKIP_BUCKETS — accept Set or Array from opts
  const T = {
    ...rawT,
    SL_SKIP_BUCKETS: rawT.SL_SKIP_BUCKETS instanceof Set
      ? rawT.SL_SKIP_BUCKETS
      : new Set(rawT.SL_SKIP_BUCKETS),
  }

  // ── Load inputs ────────────────────────────────────────────────────────────
  const portfolio  = JSON.parse(fs.readFileSync(cfg.portfolioPath,  'utf8'))
  const brainIndex = fs.existsSync(cfg.brainIndexPath)
    ? JSON.parse(fs.readFileSync(cfg.brainIndexPath, 'utf8'))
    : { stocks: {} }

  const insights = fs.existsSync(cfg.insightsPath)
    ? JSON.parse(fs.readFileSync(cfg.insightsPath, 'utf8'))
    : {}
  const insightCatalysts = insights.catalystAlerts ?? []

  const snapResult = loadLatestSnapshot(cfg.snapshotsDir)
  const snapBySymm = {}
  if (snapResult) {
    for (const h of (snapResult.snap.holdings ?? [])) snapBySymm[h.sym] = h
  }

  // ── Per-stock analysis ─────────────────────────────────────────────────────
  const now     = new Date()
  const flagged = []
  const stocks  = {}

  for (const h of portfolio.holdings) {
    const { sym, ltp, qty, avg, sl, tgtVal, conv, todayBuy, bucket } = h
    const snap   = snapBySymm[sym]
    const brain  = brainIndex.stocks[sym]

    const signals = []
    const reasons = []

    // 1. Price move
    const ltpThen = snap?.ltp ?? null
    let ltpChangePct = null
    if (ltpThen && ltpThen > 0 && ltp > 0) {
      ltpChangePct = (ltp - ltpThen) / ltpThen
      if (Math.abs(ltpChangePct) >= T.PRICE_MOVE_PCT) {
        const sign = ltpChangePct >= 0 ? '+' : ''
        signals.push('priceMove')
        reasons.push(`Price ${sign}${(ltpChangePct * 100).toFixed(1)}% (₹${ltpThen} → ₹${ltp})`)
      }
    }

    // 2. Stop-loss proximity (skip for buckets with placeholder SLs)
    let slProximityPct = null
    if (sl > 0 && ltp > 0 && !T.SL_SKIP_BUCKETS.has(bucket)) {
      slProximityPct = (ltp - sl) / ltp
      if (slProximityPct >= 0 && slProximityPct <= T.SL_PROXIMITY_PCT) {
        signals.push('slProximity')
        reasons.push(`${(slProximityPct * 100).toFixed(1)}% above SL ₹${sl} — stop at risk`)
      }
    }

    // 3. Catalyst proximity
    const nearCatalysts = findNearCatalysts(sym, brain, insightCatalysts, T.CATALYST_DAYS)
    if (nearCatalysts.length) {
      signals.push('catalystNear')
      const nearest = nearCatalysts[0]
      reasons.push(
        nearest.days <= 0
          ? `Catalyst today/passed: ${nearest.label}`
          : `Catalyst in ${nearest.days}d: ${nearest.label}`
      )
    }

    // 4. Gap-to-target change
    const value   = ltp * qty
    const gapNow  = tgtVal != null ? tgtVal - value : null
    const gapThen = snap && tgtVal != null ? tgtVal - (snap.ltp * snap.qty) : null
    let gapDelta  = null
    if (gapNow != null && gapThen != null) {
      gapDelta = gapNow - gapThen
      if (Math.abs(gapDelta) >= T.GAP_CHANGE_INR) {
        const dir = gapDelta < 0 ? 'narrowed' : 'widened'
        signals.push('gapChanged')
        reasons.push(`Gap ${dir} ₹${Math.round(Math.abs(gapDelta) / 1000)}K (now ₹${Math.round(gapNow / 1000)}K)`)
      }
    }

    // 5. New buy today
    if (todayBuy) {
      signals.push('newBuy')
      reasons.push('Position added today')
    }

    // 6. Conviction changed since snapshot
    if (snap && snap.conv !== conv) {
      signals.push('convChanged')
      reasons.push(`Conviction ${snap.conv} → ${conv}`)
    }

    if (signals.length === 0) continue

    flagged.push(sym)
    stocks[sym] = {
      sym,
      name:           h.name,
      bucket,
      signals,
      reasons,
      conviction:     conv,
      actionBias:     brain?.actionBias ?? null,
      ltpNow:         ltp,
      ltpThen,
      ltpChangePct:   ltpChangePct != null ? +(ltpChangePct * 100).toFixed(2) : null,
      value:          Math.round(value),
      gap:            gapNow != null ? Math.round(gapNow) : null,
      gapDelta:       gapDelta != null ? Math.round(gapDelta) : null,
      slProximityPct: slProximityPct != null ? +(slProximityPct * 100).toFixed(1) : null,
      nearCatalysts,
      todayBuy:       !!todayBuy,
    }
  }

  // ── Aggregate summary ──────────────────────────────────────────────────────
  const allSignals = Object.values(stocks).flatMap(s => s.signals)
  const count      = (type) => allSignals.filter(s => s === type).length

  const result = {
    generatedAt:  now.toISOString(),
    snapshotDate: snapResult?.snapDate ?? null,
    snapshotFile: snapResult?.filename ?? null,
    currentDate:  now.toISOString().slice(0, 10),
    portfolioRefreshDate: portfolio.meta?.refreshDate ?? null,
    flagged,
    summary: {
      totalFlagged: flagged.length,
      priceMoves:    count('priceMove'),
      slProximity:   count('slProximity'),
      catalystNear:  count('catalystNear'),
      gapChanged:    count('gapChanged'),
      newBuys:       count('newBuy'),
      convChanged:   count('convChanged'),
    },
    // PRD-aligned top-level arrays for UI consumption
    movingStocks:       flagged.filter(s => stocks[s].signals.includes('priceMove')),
    approachingCatalysts: flagged.filter(s => stocks[s].signals.includes('catalystNear')),
    actionableGaps:     flagged.filter(s => stocks[s].signals.includes('gapChanged')),
    newFlags:           flagged.filter(s =>
      stocks[s].signals.includes('slProximity') || stocks[s].signals.includes('convChanged')
    ),
    stocks,
    stable: flagged.length === 0,
  }

  return result
}

// ─── Write helper (used by sync.js) ──────────────────────────────────────────

export function writeSignals(result, outPath = DEFAULTS.signalsOut) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
  return outPath
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const jsonMode = process.argv.includes('--json')

  const result = detectSignals()

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    // Human-readable summary
    const { summary, flagged, stocks, snapshotDate, currentDate, stable } = result

    console.log(`\nDelta detection: ${snapshotDate ?? 'no snapshot'} → ${currentDate}`)
    console.log('─'.repeat(60))

    if (stable) {
      console.log('✓  No significant signals — portfolio stable')
    } else {
      console.log(`${summary.totalFlagged} stock(s) flagged:\n`)
      for (const sym of flagged) {
        const s = stocks[sym]
        const tags = s.signals.join(', ')
        console.log(`  ${sym.padEnd(12)} [${tags}]`)
        for (const r of s.reasons) console.log(`               → ${r}`)
      }
    }

    console.log('\nSignal counts:')
    console.log(`  Price moves:         ${summary.priceMoves}`)
    console.log(`  SL proximity:        ${summary.slProximity}`)
    console.log(`  Catalyst near (<14d): ${summary.catalystNear}`)
    console.log(`  Gap changed (>₹50K): ${summary.gapChanged}`)
    console.log(`  New buys:            ${summary.newBuys}`)
    console.log(`  Conv changed:        ${summary.convChanged}`)

    // Optionally write signals.json
    if (!process.argv.includes('--no-write') && !process.argv.includes('--dry-run')) {
      const outPath = writeSignals(result)
      console.log(`\nWrote → ${outPath}`)
    } else if (process.argv.includes('--dry-run')) {
      console.log('\n[dry-run] No files written.')
    }
  }
}
