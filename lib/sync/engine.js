import fs from 'node:fs'
import path from 'node:path'

const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function nowIst() {
  const now = new Date()
  const date = DATE_FORMATTER.format(now)
  const time = `${IST_FORMATTER.format(now)} IST`
  return { date, time, epochMs: now.getTime() }
}

function normalizeSym(input) {
  return String(input || '').trim().toUpperCase()
}

function parseNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function weightedAvg(baseQty, baseAvg, addQty, addAvg) {
  const total = baseQty + addQty
  if (total <= 0) return 0
  return ((baseQty * baseAvg) + (addQty * addAvg)) / total
}

function buildPositionMap(positions) {
  const bySym = new Map()
  for (const p of positions || []) {
    const product = String(p.product || '').toUpperCase()
    if (product !== 'CNC') continue
    const sym = normalizeSym(p.tradingsymbol || p.symbol)
    if (!sym) continue
    const qty = parseNum(p.quantity)
    const avg = parseNum(p.average_price ?? p.avg_price)
    const buyQty = parseNum(p.buy_quantity)
    const entry = bySym.get(sym) || {
      qty: 0,
      value: 0,
      todayBuy: false,
    }
    entry.qty += qty
    entry.value += qty * avg
    if (buyQty > 0) entry.todayBuy = true
    bySym.set(sym, entry)
  }
  return bySym
}

function mapHoldingsFromKite(raw) {
  const bySym = new Map()
  for (const h of raw || []) {
    const sym = normalizeSym(h.tradingsymbol || h.symbol)
    if (!sym) continue
    bySym.set(sym, {
      quantity: parseNum(h.quantity),
      t1Quantity: parseNum(h.t1_quantity),
      avg: parseNum(h.average_price ?? h.avg_price),
      ltp: parseNum(h.last_price ?? h.ltp),
    })
  }
  return bySym
}

// Manual split groups: one Kite holding is split across multiple portfolio
// rows (e.g. MARUTI 32 in Platinum + MARUTI-PA 20 in Power Alpha). Kite reports
// the combined qty under the source sym. For these rows we PRESERVE the manual
// per-row qty and only refresh price (avg/ltp) from the Kite source.
//   child portfolio sym → Kite source sym
const SPLIT_SOURCE = { 'MARUTI': 'MARUTI', 'MARUTI-PA': 'MARUTI' }

function applyRefresh(oldPortfolio, kiteHoldings, kitePositions) {
  const holdingsBySym = mapHoldingsFromKite(kiteHoldings)
  const positionsBySym = buildPositionMap(kitePositions)

  const changes = []
  const skipped = []
  const updatedHoldings = oldPortfolio.holdings.map((oldH) => {
    const sym = normalizeSym(oldH.sym)
    const splitSource = SPLIT_SOURCE[sym]
    const lookupSym = splitSource || sym
    const h = holdingsBySym.get(lookupSym)
    const p = positionsBySym.get(lookupSym)

    if (!h && !p) {
      skipped.push(sym)
      return oldH
    }

    let qty, avg, ltp, todayBuy
    if (splitSource) {
      // Split row: keep manual qty, refresh price only from the Kite source.
      qty = parseNum(oldH.qty)
      avg = h ? h.avg : oldH.avg
      ltp = h ? h.ltp : oldH.ltp
      todayBuy = oldH.todayBuy ?? false
    } else {
      const hQty = h ? (h.quantity + h.t1Quantity) : 0
      const hAvg = h ? h.avg : 0
      const hLtp = h ? h.ltp : oldH.ltp
      const pQty = p ? p.qty : 0
      const pAvg = (p && p.qty > 0) ? (p.value / p.qty) : 0
      qty = hQty + pQty
      avg = weightedAvg(hQty, hAvg, pQty, pAvg)
      ltp = hLtp
      todayBuy = Boolean(p && p.todayBuy)
    }

    const next = {
      ...oldH,
      qty: Number(qty.toFixed(4)),
      avg: Number(avg.toFixed(2)),
      ltp: Number(ltp.toFixed(2)),
      todayBuy,
    }

    const changedFields = {}
    for (const field of ['qty', 'avg', 'ltp', 'todayBuy']) {
      if (oldH[field] !== next[field]) {
        changedFields[field] = { from: oldH[field], to: next[field] }
      }
    }
    if (Object.keys(changedFields).length > 0) {
      changes.push({ sym, changedFields })
    }

    return next
  })

  return { updatedHoldings, changes, skipped }
}

function validatePortfolio(portfolio) {
  const errors = []
  const bySym = new Map(portfolio.holdings.map((h) => [normalizeSym(h.sym), h]))

  const asian = bySym.get('ASIANPAINT')
  if (asian && asian.tgtVal !== 0) errors.push('ASIANPAINT override violated: tgtVal must stay 0')

  const ltf = bySym.get('LTF')
  if (ltf && Number(ltf.conv) < 8.8) errors.push('LTF override violated: conv should remain intentional high conviction (>=8.8)')

  const maruti = bySym.get('MARUTI')
  const marutiPa = bySym.get('MARUTI-PA')
  if (maruti && marutiPa) {
    const total = parseNum(maruti.qty) + parseNum(marutiPa.qty)
    if (total <= 0) errors.push('MARUTI split invalid: combined quantity is 0')
  }

  const liquid = bySym.get('LIQUIDBEES')
  if (liquid && liquid.bucket !== 'Cash') errors.push('LIQUIDBEES override violated: must remain in Cash bucket')

  const ahlu = bySym.get('AHLUCONT')
  if (ahlu && ahlu.bucket !== 'Compounders') errors.push('AHLUCONT override violated: must remain in Compounders')

  return errors
}

function makeSnapshotName(epochMs) {
  const d = new Date(epochMs)
  const pad = (n) => String(n).padStart(2, '0')
  const ts = [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    '-',
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
  ].join('')
  return `portfolio-${ts}.json`
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function runRefresh({
  portfolioPath,
  holdingsPath,
  positionsPath,
  snapshotsDir,
  actor = 'codex-refresh-script',
  dryRun = false,
}) {
  const oldPortfolio = readJson(portfolioPath)
  const kiteHoldings = readJson(holdingsPath)
  const kitePositions = readJson(positionsPath)

  const before = oldPortfolio.holdings
  const { updatedHoldings, changes, skipped } = applyRefresh(oldPortfolio, kiteHoldings, kitePositions)
  const { date, time, epochMs } = nowIst()

  const nextPortfolio = {
    ...oldPortfolio,
    meta: {
      ...oldPortfolio.meta,
      refreshDate: date,
      refreshTime: time,
      source: 'Zerodha Kite (refresh script)',
      totalPositions: updatedHoldings.length,
      refreshAudit: {
        runAtEpochMs: epochMs,
        actor,
        inputFiles: {
          holdings: path.basename(holdingsPath),
          positions: path.basename(positionsPath),
        },
        changedSymbols: changes.map((c) => c.sym),
        skippedSymbols: skipped,
        fieldChanges: changes,
      },
    },
    holdings: updatedHoldings,
  }

  const errors = validatePortfolio(nextPortfolio)
  if (errors.length > 0) {
    const err = new Error(`Refresh aborted. Validation failed:\n- ${errors.join('\n- ')}`)
    err.validationErrors = errors
    throw err
  }

  let snapshotPath = null
  if (!dryRun) {
    ensureDir(snapshotsDir)
    const snapshotName = makeSnapshotName(epochMs)
    snapshotPath = path.join(snapshotsDir, snapshotName)
    writeJson(snapshotPath, oldPortfolio)
    writeJson(portfolioPath, nextPortfolio)
  }

  const unchangedCount = before.length - changes.length
  return {
    portfolioPath,
    snapshotPath,
    dryRun,
    totals: {
      totalHoldings: updatedHoldings.length,
      changedHoldings: changes.length,
      unchangedHoldings: unchangedCount,
      skippedFromFeed: skipped.length,
    },
    changes,
  }
}
