import { useMemo } from 'react'
import {
  computeStaleTheses,
  computeBehavioralPatterns,
  computeConvictionTrackRecord
} from '../lib/memoryEngine'
import { computeWhatChanged, computeQuietPositions } from '../lib/filingsEngine'

export function useMemoryEngine(memoryData, holdings, filings = null) {
  const ledger  = memoryData?.thesisLedger || []
  const convLog = memoryData?.convictionLog || []

  const staleTheses = useMemo(
    () => computeStaleTheses(ledger, holdings),
    [ledger, holdings]
  )

  const patterns = useMemo(
    () => computeBehavioralPatterns(ledger, holdings),
    [ledger, holdings]
  )

  const convictionTrackRecord = useMemo(
    () => computeConvictionTrackRecord(convLog, holdings),
    [convLog, holdings]
  )

  // P2.4 — what changed in filing environment since each thesis was logged
  const whatChanged = useMemo(
    () => filings ? computeWhatChanged(filings, ledger, holdings) : [],
    [filings, ledger, holdings]
  )

  const quietPositions = useMemo(
    () => filings ? computeQuietPositions(filings, ledger, holdings) : [],
    [filings, ledger, holdings]
  )

  const stats = useMemo(() => ({
    thesisCount:       ledger.length,
    convictionChanges: convLog.length,
    staleCount:        staleTheses.length,
    patternCount:      patterns.length,
    whatChangedCount:  whatChanged.length,
    coveragePct: holdings.length > 0
      ? Math.round((new Set(ledger.map(t => t.sym)).size / holdings.length) * 100)
      : 0,
    correctCallsPct: (() => {
      const scored = convictionTrackRecord.filter(e => e.correct != null)
      if (!scored.length) return null
      return Math.round((scored.filter(e => e.correct).length / scored.length) * 100)
    })()
  }), [ledger, convLog, staleTheses, patterns, whatChanged, holdings, convictionTrackRecord])

  return {
    staleTheses,
    patterns,
    convictionTrackRecord,
    whatChanged,
    quietPositions,
    stats
  }
}
