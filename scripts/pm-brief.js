#!/usr/bin/env node
/**
 * pm-brief.js — Layer 2 of the Autonomous Portfolio Manager (Phase 14).
 *
 * Mirrors the rescore-conviction prep/apply pattern. NEVER touches Kite.
 *
 *   PREP   node scripts/pm-brief.js --prep
 *     Runs pmEngine over live data → src/data/pm-candidates.json (raw situations).
 *
 *   (Claude reads pm-candidates.json + INVESTMENT_BRAIN.md, applies do-nothing-biased
 *    judgment, writes src/data/pm-decisions.json — the real calls, sized & voiced.)
 *
 *   APPLY  node scripts/pm-brief.js --apply
 *     Validates pm-decisions.json → writes src/data/pm-brief.json (UI source of truth)
 *     and appends proposals to memory.json.pmLedger.
 *
 *   AUTO   node scripts/pm-brief.js            (default, no Claude)
 *     Prep + a deterministic fallback brief so the tab is never empty before Claude runs.
 *
 * Flags: --prep | --apply | --dry-run
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { computePMCandidates } from '../src/lib/pmEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const D = f => path.join(__dirname, '..', 'src', 'data', f)
const read = f => JSON.parse(fs.readFileSync(D(f), 'utf8'))
const readOpt = (f, fallback) => { try { return read(f) } catch { return fallback } }

const ARGV = process.argv.slice(2)
const DRY = ARGV.includes('--dry-run')
const MODE = ARGV.includes('--apply') ? 'apply' : ARGV.includes('--prep') ? 'prep' : 'auto'
const write = (f, obj) => { if (!DRY) fs.writeFileSync(D(f), JSON.stringify(obj, null, 2)) }
const today = new Date()
const todayStr = today.toISOString().split('T')[0]

function gatherCandidates() {
  const portfolio = read('portfolio.json')
  const aiInsights = readOpt('ai-insights.json', {})
  const brainIndex = readOpt('brain-index.json', {})
  const insightsData = readOpt('insights.json', {})
  const rearview = readOpt('rearview.json', {})
  const signals = readOpt('signals.json', {})
  const catalysts = aiInsights.catalystAlerts || []
  const convictionDigest = readOpt('conviction-digest.json', {})
  const benchmark = readOpt('benchmark.json', {})
  // Idle cash: read from margins if present, else 0 (read-only, never assumed).
  const idleCash = readOpt('margins.json', {})?.equity?.available?.cash || 0
  return computePMCandidates({
    holdings: portfolio.holdings, aiInsights, brainIndex, insightsData,
    rearview, signals, catalysts, convictionDigest, benchmark, idleCash, today,
  })
}

function prep() {
  const out = gatherCandidates()
  write('pm-candidates.json', out)
  console.log(`\nPM brief — PREP (${out.asOf})`)
  console.log(`  Candidates: ${out.candidates.length}`)
  for (const c of out.candidates) {
    console.log(`    ${c.type.padEnd(7)} ${c.syms.join(', ').padEnd(22)} ${c.rawSize ? '₹' + (c.rawSize / 1e5).toFixed(2) + 'L' : ''}`)
  }
  if (!out.candidates.length) console.log('  Nothing crossed a threshold — STAND_PAT day.')
  else console.log(`\n  → pm-candidates.json. Next: Claude writes pm-decisions.json, then --apply.`)
}

const L = n => `₹${(n / 1e5).toFixed(2)}L`

function deterministicBrief(cands) {
  // Fallback brief (no Claude): faithful, tiered pass-through of candidates.
  const decisions = cands.map((c, i) => {
    const sym = c.syms[0]
    const e = c.evidence
    let title, rationale, ticket = null
    switch (c.type) {
      case 'CUT':
        title = `Exit ${sym}`
        rationale = e.keeperReason || `Conviction ${e.conv}, broken thesis.`
        ticket = { side: 'SELL', sym, qty: e.qty, limitHint: e.ltp ? `≥ ₹${e.ltp}` : 'market' }; break
      case 'TRIM':
        title = `Trim ${sym} to model weight`
        rationale = `Overweight +${e.overByPct}% with conviction ${e.conv}.`
        ticket = { side: 'SELL', sym, qty: null, limitHint: e.ltp ? `≥ ₹${e.ltp}` : 'market', note: `~${L(c.rawSize)}` }; break
      case 'DEPLOY': case 'ROTATE':
        title = c.type === 'ROTATE' ? `Rotate ${L(c.rawSize)} into keepers` : `Deploy ${L(c.rawSize)}`
        rationale = `${e.source}: ${(e.targets || []).map(t => `${t.sym} ${L(t.amount)}`).join(', ')}.`; break
      case 'WATCH':
        title = `Watch ${c.syms.join(', ')}`
        rationale = `${e.event} in ${e.daysOut}d${e.risk ? ` · ${e.risk}` : ''}. No action yet.`; break
      case 'SL_PROXIMITY':
        title = `${sym} near stop-loss`
        rationale = `${e.distPct}% above SL ₹${e.sl} (CMP ₹${e.ltp}). Watch — don't pre-empt the level.`; break
      case 'CONVICTION_DRIFT':
        title = `${sym} conviction ${e.from}→${e.to}`
        rationale = e.reason || `Conviction moved ${e.direction}.`; break
      case 'HEDGE_GAP':
        title = `Hedge underweight — ${e.gapPp}pp light`
        rationale = `Gold+silver at ${e.curPct}% vs ${e.idealPct}% ideal. Build toward ${L(c.rawSize)} of hedge when deploying.`; break
      case 'CASH_GAP':
        title = `Crash buffer light — ${e.gapPp}pp under`
        rationale = `Cash at ${e.curPct}% vs ${e.idealPct}% ideal. Keep ${L(c.rawSize)} dry for a -8% session.`; break
      case 'BUCKET_GAP':
        title = `${e.bucket} underweight — ${e.gapPp}pp`
        rationale = `At ${e.curPct}% vs ${e.idealPct}% ideal. New money leans here.`; break
      case 'MODEL_GAP':
        title = `Platinum model gaps`
        rationale = `Most underweight vs advisor model: ${(e.gaps || []).map(g => `${g.sym} ${g.gapPp}pp`).join(', ')}.`; break
      case 'CONCENTRATION':
        title = `${sym} is ${e.weightPct}% of book`
        rationale = `Single-stock weight above 8% (${L(e.value)}). Awareness — trim only if conviction fades.`; break
      case 'LET_RUN':
        title = `Let ${sym} run`
        rationale = `+${e.pnlPct}% on conviction ${e.conv}. Holding >1yr is where your alpha lives — don't book early.`; break
      default:
        title = `${c.type} ${c.syms.join(', ')}`; rationale = ''
    }
    return {
      id: `pm-${c.type}-${sym || c.evidence.bucket || i}-${todayStr.replace(/-/g, '')}`,
      tier: c.tier, type: c.type, syms: c.syms, size: c.rawSize,
      title, rationale, rearviewNote: c.evidence.rearview || null,
      ticket, confidence: c.tier === 'decision' ? 'high' : 'medium',
    }
  })
  const decisionCount = decisions.filter(d => d.tier === 'decision').length
  return {
    stance: decisionCount ? 'ACTION_WARRANTED' : 'STAND_PAT',
    standPatReason: decisionCount ? null
      : 'No decision crossed a threshold. The disciplined move is to hold — your tape proves over-action costs money. Posture and watch items below.',
    decisions,
    generatedBy: 'deterministic',
  }
}

function apply() {
  const cands = readOpt('pm-candidates.json', null) || gatherCandidates()
  // Prefer Claude's decisions if present and fresh; else deterministic fallback.
  let brief
  const claude = readOpt('pm-decisions.json', null)
  if (claude && claude.asOf === todayStr && Array.isArray(claude.decisions)) {
    brief = { stance: claude.stance, standPatReason: claude.standPatReason || null, decisions: claude.decisions, generatedBy: 'claude' }
  } else {
    brief = deterministicBrief(cands.candidates || [])
  }

  // Streak: consecutive STAND_PAT days (read prior brief)
  const prior = readOpt('pm-brief.json', null)
  const priorStreak = prior?.streak?.standPatDays || 0
  const standPatDays = brief.stance === 'STAND_PAT' ? priorStreak + 1 : 0

  const finalBrief = {
    generatedAt: new Date().toISOString(), asOf: todayStr,
    stance: brief.stance, standPatReason: brief.standPatReason,
    posture: cands.posture || null,
    decisions: brief.decisions, streak: { standPatDays }, generatedBy: brief.generatedBy,
  }
  write('pm-brief.json', finalBrief)

  // Append only ratifiable (decision-tier) proposals to the supervision ledger
  const memory = read('memory.json')
  if (!Array.isArray(memory.pmLedger)) memory.pmLedger = []
  const existing = new Set(memory.pmLedger.map(x => x.id))
  for (const d of brief.decisions) {
    if (d.tier !== 'decision' || existing.has(d.id)) continue
    memory.pmLedger.push({
      id: d.id, type: d.type, syms: d.syms, size: d.size || null,
      proposedAt: todayStr, response: 'PENDING', respondedAt: null, snoozeUntil: null,
      rationale: d.rationale,
    })
  }
  write('memory.json', memory)

  console.log(`\nPM brief — APPLY (${todayStr}) · stance: ${finalBrief.stance} · by ${finalBrief.generatedBy}`)
  if (finalBrief.stance === 'STAND_PAT') console.log(`  Hold. Disciplined streak: ${standPatDays} day(s).`)
  for (const d of brief.decisions) console.log(`  ${d.type.padEnd(7)} ${d.title}`)
  if (!DRY) console.log(`  → pm-brief.json + memory.pmLedger`)
}

if (MODE === 'prep') prep()
else if (MODE === 'apply') apply()
else { prep(); apply() }
