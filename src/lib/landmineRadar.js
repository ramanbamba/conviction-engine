/**
 * landmineRadar.js — cut fast. "The whole game" (rearview.json: a few fat-tail
 * losers — NCC, DLF — erased years of gains; top-5 losers did −₹8.06L, 40% of
 * all losses). This scans the held book for the India-specific destroyers and is
 * loudest exactly when a thesis is breaking and capital must leave.
 *
 * The destroyers (multiplicative, structural — they produce 50–90% drawdowns
 * regardless of momentum):
 *   PLEDGE   — promoter pledge / hollow stake (GATE_gov)          → GOKEX, KPIGREEN
 *   EARNINGS — accrual / cash-quality / audit RED (GATE_eq, audit) → KAYNES, SHK
 *   DERATING — structural decline the gates miss: weak score + below the 200DMA
 *              + real drawdown (the INFY pattern: clean gates, melting thesis)
 *   STOP     — price through the stop
 *
 * A structural flag becomes CRITICAL when it coincides with SIZE or a real loss —
 * that's the fat-tail-loser-in-waiting. Small, un-levered flags are WARNINGs.
 *
 * scanLandmines(holdings, alphaMap, auditMap, insightsData) → {
 *   rows:[{sym,severity,flags,weight,value,conv,pnlPct,alpha}], critical[],
 *   warning[], watch[], atRiskValue, criticalCount
 * }
 */

const STRATEGIC = new Set(['Hedge', 'Cash', 'Satellites'])

const SEV_RANK = { CRITICAL: 3, WARNING: 2, WATCH: 1, OK: 0 }

export const SEVERITY_META = {
  CRITICAL: { color: '#EF4444', cls: 'text-red border-red/30 bg-red/10', label: 'Critical' },
  WARNING:  { color: '#F59E0B', cls: 'text-amber border-amber/30 bg-amber/10', label: 'Warning' },
  WATCH:    { color: '#a1a1aa', cls: 'text-zinc-400 border-white/10 bg-white/5', label: 'Watch' },
}

export function scanLandmines(holdings = [], alphaMap = {}, auditMap = {}, insightsData = null) {
  const val = h => (h.qty || 0) * (h.ltp || 0)
  const total = holdings.reduce((a, h) => a + val(h), 0) || 1

  const rows = holdings
    .filter(h => !STRATEGIC.has(h.bucket))
    .map(h => {
      const m = alphaMap[h.sym]
      const tech = insightsData?.positions?.[h.sym]?.computedTechnicals
      const weight = val(h) / total
      const pnlPct = h.avg ? (h.ltp - h.avg) / h.avg : 0
      const audit = auditMap[h.sym]?.severity
      const flags = []

      // ── Structural destroyers ──
      if (m && m.gates.gov < 0.85) {
        flags.push({ type: 'PLEDGE', structural: true, detail: m.risk?.includes('govern') ? m.risk : 'promoter pledge / hollow stake (GATE_gov)' })
      }
      if ((m && m.gates.eq < 0.85) || audit === 'RED') {
        flags.push({ type: 'EARNINGS', structural: true, detail: audit === 'RED' ? 'earnings audit RED' : 'cash-quality / accrual gate (GATE_eq)' })
      }
      // De-rating: the gates are clean but the thesis is melting (INFY pattern)
      const belowLT = tech?.vsSma200Pct != null && tech.vsSma200Pct < -10
      if (!flags.some(f => f.type === 'PLEDGE' || f.type === 'EARNINGS') && (m?.score ?? 100) < 58 && belowLT && pnlPct < -0.15) {
        flags.push({ type: 'DERATING', structural: true, detail: `below 200DMA ${tech.vsSma200Pct.toFixed(0)}% · score ${m?.score ?? '—'} · ${(pnlPct * 100).toFixed(0)}%` })
      }

      // ── Confirmations (not structural on their own) ──
      if (h.sl && h.ltp < h.sl) flags.push({ type: 'STOP', structural: false, detail: `CMP ₹${Math.round(h.ltp)} < SL ₹${h.sl}` })
      if (pnlPct < -0.20) flags.push({ type: 'DRAWDOWN', structural: false, detail: `${(pnlPct * 100).toFixed(0)}% from cost` })

      // ── Severity: a structural break is a fat tail only when it's big enough
      // to hurt. Tradebook: the destroyers erased years of gains *at size*. ──
      const structCount = flags.filter(f => f.structural).length
      let severity = 'OK'
      if (structCount > 0) {
        const fatTail = weight >= 0.03 || pnlPct < -0.25   // meaningful capital, or already bleeding hard
        severity = fatTail ? 'CRITICAL' : 'WARNING'
      } else if (flags.length > 0) {
        severity = 'WATCH'                                  // stop/drawdown without a structural cause
      }

      return {
        sym: h.sym, bucket: h.bucket, conv: h.conv ?? null, alpha: m?.score ?? null,
        weight: weight * 100, value: val(h), pnlPct, severity, flags,
        headline: flags[0]?.detail || null,
      }
    })
    .filter(r => r.severity !== 'OK')
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.value - a.value)

  const critical = rows.filter(r => r.severity === 'CRITICAL')
  return {
    rows,
    critical,
    warning: rows.filter(r => r.severity === 'WARNING'),
    watch: rows.filter(r => r.severity === 'WATCH'),
    criticalCount: critical.length,
    atRiskValue: critical.reduce((a, r) => a + r.value, 0),
  }
}
