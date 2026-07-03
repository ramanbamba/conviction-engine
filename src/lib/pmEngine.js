/**
 * pmEngine.js — Layer 1 of the Autonomous Portfolio Manager (Phase 14).
 *
 * Deterministic candidate assembler. Reuses the shipped engines (keeperTest,
 * guardrails, deploymentEngine, rebalanceEngine) to surface every situation
 * worth the PM's attention, tiered so action stays rare and awareness stays rich:
 *
 *   tier 'decision' — ratifiable now (CUT / TRIM / DEPLOY / ROTATE)
 *   tier 'watch'    — monitoring, no action (WATCH / SL_PROXIMITY / CONVICTION_DRIFT)
 *   tier 'standing' — structural posture (HEDGE_GAP / MODEL_GAP / CONCENTRATION / LET_RUN)
 *
 * Also emits a `posture` summary — the PM's opening read on the book.
 * Never decides final sizing (Claude's job in Layer 2) and never touches Kite.
 */
import { keeperVerdict } from './keeperTest.js'
import { computeGuardrails } from './guardrails.js'
import { computeDeployment } from './deploymentEngine.js'
import { computeRebalance } from './rebalanceEngine.js'
import { IDEAL_PORTFOLIO } from '../config/idealPortfolio.js'

const MODEL_BUCKETS = new Set(['Platinum', 'Power Alpha'])
const STRATEGIC_BUCKETS = new Set(['Hedge', 'Cash', 'Satellites'])
const CATALYST_WINDOW_DAYS = 14
const MIN_DEPLOY = 25000
const CONCENTRATION_CAP = 0.08      // flag single-stock weight above 8%
const SL_PROXIMITY_PCT = 0.05       // within 5% of stop-loss
const REF_CORPUS = 10000000         // the reference corpus ideal reference

function enrich(raw = []) {
  return raw.map(h => {
    const invested = (h.qty || 0) * (h.avg || 0)
    const value = (h.qty || 0) * (h.ltp || 0)
    const pnl = value - invested
    const pnlPct = invested > 0 ? pnl / invested : 0
    return { ...h, invested, value, pnl, pnlPct }
  })
}

function daysUntil(dateStr, today) {
  if (!dateStr) return null
  const parts = String(dateStr).split('-')
  const d = parts.length === 1 ? new Date(`${parts[0]}-01-01`)
    : parts.length === 2 ? new Date(`${parts[0]}-${parts[1]}-01`)
    : new Date(dateStr)
  if (isNaN(d)) return null
  return Math.round((d - today) / 86400000)
}

function rearviewNote(rearview, sym) {
  const rt = (rearview.roundTrippers || []).find(r => r.symbol === sym)
  const ledger = (rearview.stockLedger || []).find(s => s.symbol === sym)
  if (!rt && !ledger) return null
  const bits = []
  if (rt) bits.push(`round-tripped ${rt.entries}×`)
  if (ledger) bits.push(`${ledger.trips} lifetime trips, ${ledger.winRate}% win`)
  return bits.join(' · ')
}

export function computePMCandidates({
  holdings = [], aiInsights = {}, brainIndex = {}, insightsData = {},
  rearview = {}, signals = {}, catalysts = [], convictionDigest = {},
  benchmark = {}, idleCash = 0, today = new Date(),
} = {}) {
  const h = enrich(holdings)
  const asOf = today.toISOString().split('T')[0]
  const C = []
  const push = (tier, type, syms, rawSize, evidence) => C.push({ tier, type, syms, rawSize, evidence })

  const totalVal = h.reduce((a, x) => a + x.value, 0) || 1
  const guardrails = computeGuardrails(h, rearview)
  const guardBySym = Object.fromEntries(guardrails.map(g => [g.sym, g]))

  // ── DECISION tier ──────────────────────────────────────────────
  const churnSyms = new Set()
  for (const row of h) {
    if (MODEL_BUCKETS.has(row.bucket) || STRATEGIC_BUCKETS.has(row.bucket)) continue
    const keeper = keeperVerdict(row, rearview)
    const slBreach = row.sl && row.ltp && row.ltp <= row.sl
    if (keeper?.verdict === 'CHURN' || (row.conv ?? 10) <= 5 || slBreach || row.exitSignal) {
      churnSyms.add(row.sym)
      push('decision', 'CUT', [row.sym], Math.round(row.value), {
        bucket: row.bucket, conv: row.conv ?? null, pnlPct: row.pnlPct,
        keeper: keeper?.verdict, keeperReason: keeper?.reason,
        slBreach: !!slBreach, exitSignal: !!row.exitSignal,
        guardrail: guardBySym[row.sym]?.message || null, rearview: rearviewNote(rearview, row.sym),
        qty: row.qty, ltp: row.ltp, sl: row.sl,
      })
    }
  }
  for (const row of h) {
    if (MODEL_BUCKETS.has(row.bucket) || STRATEGIC_BUCKETS.has(row.bucket) || churnSyms.has(row.sym)) continue
    if (row.tgtVal && row.value > row.tgtVal * 1.10 && (row.conv ?? 10) < 7) {
      push('decision', 'TRIM', [row.sym], Math.round(row.value - row.tgtVal), {
        bucket: row.bucket, conv: row.conv ?? null, value: Math.round(row.value), tgtVal: row.tgtVal,
        overByPct: Math.round((row.value / row.tgtVal - 1) * 100), qty: row.qty, ltp: row.ltp,
      })
    }
  }
  const rotationProceeds = [...churnSyms].reduce((a, s) => a + (h.find(x => x.sym === s)?.value || 0), 0)
  const deployAmount = idleCash + rotationProceeds
  if (deployAmount >= MIN_DEPLOY) {
    const dep = computeDeployment(h, { amount: deployAmount, mode: 'new', rearview })
    const top = (dep.allocations || []).slice(0, 4)
    if (top.length) {
      const type = rotationProceeds >= MIN_DEPLOY ? 'ROTATE' : 'DEPLOY'
      push('decision', type, top.map(a => a.sym), Math.round(deployAmount), {
        source: rotationProceeds >= MIN_DEPLOY ? `churn proceeds (${[...churnSyms].join(', ')})` : 'idle cash',
        idleCash: Math.round(idleCash), rotationProceeds: Math.round(rotationProceeds),
        targets: top.map(a => ({ sym: a.sym, bucket: a.bucket, amount: a.amount, rationale: a.rationale })),
      })
    }
  }

  // ── WATCH tier ─────────────────────────────────────────────────
  const seen = new Set(C.flatMap(c => c.syms))
  // Catalysts imminent
  for (const c of catalysts) {
    const dd = daysUntil(c.date, today)
    if (dd == null || dd < 0 || dd > CATALYST_WINDOW_DAYS) continue
    const syms = (c.stocks || []).filter(s => h.some(x => x.sym === s))
    if (!syms.length || syms.every(s => seen.has(s))) continue
    push('watch', 'WATCH', syms, null, { event: c.event, date: c.date, daysOut: dd, risk: c.risk || null, portfolioAction: c.portfolioAction || null })
    syms.forEach(s => seen.add(s))
  }
  // Stop-loss proximity (not breached, within 5%) — equities only
  for (const row of h) {
    if (!row.sl || !row.ltp || churnSyms.has(row.sym) || STRATEGIC_BUCKETS.has(row.bucket)) continue
    const dist = (row.ltp - row.sl) / row.sl
    if (dist > 0 && dist <= SL_PROXIMITY_PCT) {
      push('watch', 'SL_PROXIMITY', [row.sym], null, { bucket: row.bucket, ltp: row.ltp, sl: row.sl, distPct: +(dist * 100).toFixed(1), conv: row.conv ?? null })
    }
  }
  // Recent conviction drift (from the weekly digest)
  for (const ch of (convictionDigest.changes || [])) {
    if (!h.some(x => x.sym === ch.sym)) continue
    push('watch', 'CONVICTION_DRIFT', [ch.sym], null, { from: ch.from, to: ch.to, direction: ch.direction, reason: ch.reason })
  }

  // ── STANDING tier (structural posture) ─────────────────────────
  // Bucket gaps vs the ideal compass (Hedge / Cash / Compounders most relevant)
  const bucketVal = {}
  for (const row of h) bucketVal[row.bucket] = (bucketVal[row.bucket] || 0) + row.value
  for (const [bucket, cfg] of Object.entries(IDEAL_PORTFOLIO.buckets)) {
    const curPct = (bucketVal[bucket] || 0) / totalVal * 100
    const idealPct = cfg.pct * 100
    const gapPp = idealPct - curPct
    if (gapPp >= 3) {
      const gapRupees = Math.round((idealPct / 100) * REF_CORPUS - (bucketVal[bucket] || 0))
      push('standing', bucket === 'Hedge' ? 'HEDGE_GAP' : bucket === 'Cash' ? 'CASH_GAP' : 'BUCKET_GAP',
        [], gapRupees > 0 ? gapRupees : null, { bucket, curPct: +curPct.toFixed(1), idealPct, gapPp: +gapPp.toFixed(1) })
    }
  }
  // Platinum model gaps (most underweight vs Advisor weight)
  const platTotal = bucketVal['Platinum'] || 1
  const modelGaps = h.filter(x => x.bucket === 'Platinum' && x.advisorWt)
    .map(x => ({ sym: x.sym, gapPp: x.advisorWt * 100 - (x.value / platTotal * 100), conv: x.conv }))
    .filter(x => x.gapPp > 0.5).sort((a, b) => b.gapPp - a.gapPp).slice(0, 3)
  if (modelGaps.length) {
    push('standing', 'MODEL_GAP', modelGaps.map(m => m.sym), null, { gaps: modelGaps.map(m => ({ sym: m.sym, gapPp: +m.gapPp.toFixed(1), conv: m.conv })) })
  }
  // Concentration: single stock above cap
  for (const row of h) {
    const w = row.value / totalVal
    if (w > CONCENTRATION_CAP) {
      push('standing', 'CONCENTRATION', [row.sym], null, { weightPct: +(w * 100).toFixed(1), value: Math.round(row.value), conv: row.conv ?? null })
    }
  }
  // Let winners run: high-conviction names well in profit (reinforce holding)
  for (const row of h) {
    if ((row.conv ?? 0) >= 8 && row.pnlPct >= 0.20) {
      push('standing', 'LET_RUN', [row.sym], null, { conv: row.conv, pnlPct: +(row.pnlPct * 100).toFixed(0), bucket: row.bucket })
    }
  }

  // ── POSTURE summary ────────────────────────────────────────────
  const hiConvVal = h.filter(x => (x.conv ?? 0) >= 8).reduce((a, x) => a + x.value, 0)
  const hedgeVal = (bucketVal['Hedge'] || 0) + (bucketVal['Cash'] || 0)
  const win = benchmark?.windows?.['1y'] || benchmark?.windows?.ytd || null
  const posture = {
    bookValue: Math.round(totalVal),
    positions: h.length,
    hiConvPct: +(hiConvVal / totalVal * 100).toFixed(0),
    hedgePct: +(hedgeVal / totalVal * 100).toFixed(1),
    alphaPct: win?.alpha != null ? +(win.alpha * 100).toFixed(1) : null,
    alphaWindow: win?.label || null,
    decisionCount: C.filter(c => c.tier === 'decision').length,
  }

  return { asOf, generatedAt: new Date().toISOString(), posture, candidates: C }
}
