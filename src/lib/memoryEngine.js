// P2 Memory Engine — pure functions, no React imports
// All functions take plain data and return plain data (no side effects)

const CHECKIN_DAYS = [30, 90, 180]
const ACK_KEY = (days) => `ack${days}`

// Returns thesis entries that are within a 3-day window of a check-in milestone
// and haven't been acknowledged yet. Only for positions still held.
export function computeStaleTheses(thesisLedger, holdings) {
  const holdingSet = new Set(holdings.map(h => h.sym))
  const today = new Date()

  return thesisLedger
    .filter(entry => holdingSet.has(entry.sym))
    .flatMap(entry => {
      const entryDate = new Date(entry.date)
      const daysHeld = Math.floor((today - entryDate) / 86_400_000)

      return CHECKIN_DAYS
        .filter(c => Math.abs(daysHeld - c) <= 3 && !entry[ACK_KEY(c)])
        .map(checkpoint => ({ ...entry, daysHeld, checkpoint }))
    })
}

// Detects statistically computable behavioral patterns.
// Requires at least a few thesis entries to return anything meaningful.
// Design principle: show pattern, don't editorialize.
export function computeBehavioralPatterns(thesisLedger, holdings) {
  const patterns = []
  const holdingMap = buildHoldingMap(holdings)

  const activeEntries  = thesisLedger.filter(t => holdingMap[t.sym])
  const coveredSyms    = new Set(activeEntries.map(t => t.sym))
  const uncovered      = holdings.filter(h => !coveredSyms.has(h.sym))

  // Coverage gap
  if (uncovered.length > 0) {
    patterns.push({
      id: 'thesis_coverage',
      type: 'warning',
      label: `${uncovered.length} of ${holdings.length} positions have no logged thesis`,
      detail: 'Memory Engine blind spots — these positions cannot feed P2 analysis.',
      stocks: uncovered.map(h => h.sym)
    })
  }

  // Conviction drift across active positions
  const drifted = activeEntries.filter(t => {
    const h = holdingMap[t.sym]
    return h && t.convAtEntry != null && Math.abs(h.conv - t.convAtEntry) >= 1
  })

  if (drifted.length > 0) {
    const avgShift = drifted.reduce((s, t) => s + (holdingMap[t.sym].conv - t.convAtEntry), 0) / drifted.length
    patterns.push({
      id: 'conviction_drift',
      type: avgShift < -1 ? 'warning' : 'info',
      label: `${drifted.length} position${drifted.length > 1 ? 's' : ''} with conviction drift since entry`,
      detail: `Average shift: ${avgShift > 0 ? '+' : ''}${avgShift.toFixed(1)} pts. Thesis assumptions may have evolved.`,
      stocks: drifted.map(t => t.sym)
    })
  }

  // Entry conviction vs outcome — only meaningful with ≥5 entries that have pnlPct
  const scoreable = activeEntries.filter(t => t.convAtEntry != null && holdingMap[t.sym]?.pnlPct != null)
  if (scoreable.length >= 5) {
    const highConv  = scoreable.filter(t => t.convAtEntry >= 8)
    const lowerConv = scoreable.filter(t => t.convAtEntry < 8)
    const avgReturn = arr => arr.length ? arr.reduce((s, t) => s + holdingMap[t.sym].pnlPct, 0) / arr.length : null

    const hcReturn = avgReturn(highConv)
    const lcReturn = avgReturn(lowerConv)

    if (hcReturn != null && lcReturn != null) {
      patterns.push({
        id: 'conviction_vs_return',
        type: 'info',
        label: `High-conviction entries (≥8) averaging ${pct(hcReturn)} vs ${pct(lcReturn)} for lower-conviction`,
        detail: `Based on ${highConv.length} high-conv and ${lowerConv.length} lower-conv positions in current portfolio.`,
        stocks: highConv.map(t => t.sym)
      })
    }
  }

  // Bucket return dispersion (requires entries across multiple buckets)
  const byBucket = {}
  activeEntries.forEach(t => {
    const h = holdingMap[t.sym]
    if (!h || h.pnlPct == null) return
    if (!byBucket[t.bucket]) byBucket[t.bucket] = []
    byBucket[t.bucket].push(h.pnlPct)
  })

  const bucketAvgs = Object.entries(byBucket)
    .filter(([, returns]) => returns.length >= 2)
    .map(([bucket, returns]) => ({
      bucket,
      avg: returns.reduce((s, r) => s + r, 0) / returns.length,
      n: returns.length
    }))
    .sort((a, b) => b.avg - a.avg)

  if (bucketAvgs.length >= 2) {
    const best  = bucketAvgs[0]
    const worst = bucketAvgs[bucketAvgs.length - 1]
    if (Math.abs(best.avg - worst.avg) > 0.05) {
      patterns.push({
        id: 'bucket_return_dispersion',
        type: 'info',
        label: `${best.bucket} (${pct(best.avg)}) vs ${worst.bucket} (${pct(worst.avg)}) — widest bucket return gap`,
        detail: `Based on ${best.n + worst.n} positions with logged thesis entries.`,
        stocks: []
      })
    }
  }

  return patterns
}

// Returns conviction log entries enriched with subsequent price action.
// Answers: "was your conviction call directionally right?"
export function computeConvictionTrackRecord(convictionLog, holdings) {
  if (!convictionLog?.length) return []

  const holdingMap = buildHoldingMap(holdings)

  return convictionLog
    .map(entry => {
      const h = holdingMap[entry.sym]
      const priceReturn = (h && entry.priceAtChange)
        ? (h.ltp - entry.priceAtChange) / entry.priceAtChange
        : null

      // "up" conviction + positive return = correct call
      const correct = priceReturn == null ? null : entry.direction === 'up'
        ? priceReturn > 0
        : priceReturn < 0

      return { ...entry, currentLtp: h?.ltp ?? null, priceReturn, correct }
    })
    .filter(e => e.currentLtp != null)
}

// Pure factory: returns updated memory object with a new thesis entry
export function addThesisEntry(memory, payload) {
  const {
    sym, thesis, date, convAtEntry, avgAtEntry, qtyAtEntry,
    bucket, actionType, filledQty, filledPrice, execLatencyMs
  } = payload
  const entry = {
    id: `${sym}-${Date.now()}`,
    sym, thesis, date,
    convAtEntry:   convAtEntry  ?? null,
    avgAtEntry:    avgAtEntry   ?? null,
    qtyAtEntry:    qtyAtEntry   ?? null,
    bucket:        bucket       ?? null,
    actionType:    actionType   ?? 'buy',
    ...(filledQty    != null && { filledQty }),
    ...(filledPrice  != null && { filledPrice }),
    ...(execLatencyMs != null && { execLatencyMs }),
  }
  return { ...memory, thesisLedger: [...(memory.thesisLedger || []), entry] }
}

// Pure factory: returns updated memory with a conviction drift log entry
export function addConvictionDriftEntry(memory, payload) {
  const { sym, from, to, reason, date, priceAtChange } = payload
  const entry = {
    id:           `conv-${sym}-${Date.now()}`,
    sym,
    from,
    to,
    direction:    to > from ? 'up' : 'down',
    reason:       reason      || null,
    date,
    priceAtChange: priceAtChange ?? null
  }
  return { ...memory, convictionLog: [...(memory.convictionLog || []), entry] }
}

// Pure factory: returns updated memory with an ignored action logged
export function addIgnoredAction(memory, payload) {
  const { sym, actionText, date } = payload
  const entry = { sym, actionText, date }
  return { ...memory, ignoredActions: [...(memory.ignoredActions || []), entry] }
}

// Pure factory: acknowledges a thesis check-in milestone
export function acknowledgeCheckin(memory, entryId, checkpoint) {
  return {
    ...memory,
    thesisLedger: memory.thesisLedger.map(t =>
      t.id === entryId ? { ...t, [ACK_KEY(checkpoint)]: true } : t
    )
  }
}

// B2: logs a disciplinary bypass (user acknowledged a red anti-pattern and proceeded anyway)
export function addInterruptBypass(memory, pattern) {
  const entry = { pattern, date: new Date().toISOString().split('T')[0], ts: Date.now() }
  return { ...memory, discipline: [...(memory.discipline || []), entry] }
}

// B2: compute days-clean streak since last bypass
export function computeDisciplineStreak(discipline = []) {
  if (!discipline.length) return { streakDays: null, totalBypasses: 0, lastBypassDate: null, lastPattern: null }
  const sorted = [...discipline].sort((a, b) => b.ts - a.ts)
  const last   = sorted[0]
  const streakDays = Math.floor((new Date() - new Date(last.date)) / 86_400_000)
  return { streakDays, totalBypasses: discipline.length, lastBypassDate: last.date, lastPattern: last.pattern }
}

// B3: reflection checkpoints — separate from check-in milestones (those are about the thesis text;
// reflections ask "was the call right?")
const REFLECTION_DAYS = [30, 90]

export function computePendingReflections(thesisLedger, holdings) {
  const holdingSet = new Set(holdings.map(h => h.sym))
  const today      = new Date()

  return thesisLedger
    .filter(entry => holdingSet.has(entry.sym))
    .flatMap(entry => {
      const daysHeld = Math.floor((today - new Date(entry.date)) / 86_400_000)
      return REFLECTION_DAYS
        .filter(c => daysHeld >= c && !entry[`reflection${c}`])
        .map(checkpoint => ({ ...entry, daysHeld, checkpoint }))
    })
}

// B3: save a completed reflection onto the ledger entry
export function addReflection(memory, entryId, checkpoint, payload) {
  return {
    ...memory,
    thesisLedger: memory.thesisLedger.map(t =>
      t.id === entryId
        ? { ...t, [`reflection${checkpoint}`]: { ...payload, date: new Date().toISOString().split('T')[0] } }
        : t
    )
  }
}

// --- helpers ---

function buildHoldingMap(holdings) {
  const map = {}
  holdings.forEach(h => { map[h.sym] = h })
  return map
}

function pct(n) {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`
}
