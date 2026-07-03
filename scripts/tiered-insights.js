/**
 * tiered-insights.js
 *
 * Three-mode intelligence pipeline. Each mode uses the cheapest model capable
 * of the task and the smallest useful context window.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Mode       │ When           │ Model  │ Context         │ Cost target   │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ weekly     │ Automated sync │ Haiku  │ flagged stocks  │ $0.001–0.02   │
 * │ targeted   │ On-demand      │ Sonnet │ 1 stock brain   │ $0.02–0.05    │
 * │ full       │ Quarterly      │ Sonnet │ full profile    │ $0.30–0.50    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * weekly mode:
 *   Reads signals.json (from detect-signals.js). Builds a minimal context from
 *   brain-index[sym] for each flagged stock. Calls Haiku to produce a fresh
 *   actionQueue + catalystAlerts. Merges result into ai-insights.json as
 *   `weeklyUpdate` — preserving the standing full-run analysis fields intact.
 *   If no stocks are flagged (stable=true), writes a zero-cost stable update.
 *
 * targeted mode:
 *   Analyses one stock using its brain-index entry + current position.
 *   Writes a `stockUpdates[sym]` note into ai-insights.json weeklyUpdate.
 *
 * full mode:
 *   Full portfolio reanalysis using the complete investment-profile.json.
 *   Replaces all fields in ai-insights.json. Same as the old generate-insights.js.
 *
 * CLI:
 *   node scripts/tiered-insights.js                 → weekly (default)
 *   node scripts/tiered-insights.js --stock HAL     → targeted
 *   node scripts/tiered-insights.js --full          → full
 *   node scripts/tiered-insights.js --dry-run       → print plan, no API call
 *
 * npm:
 *   npm run insights:weekly
 *   npm run insights:targeted -- --stock HAL
 *   npm run insights          (unchanged, still runs full mode)
 */

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import fs        from 'fs'
import path      from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.join(__dirname, '..')

const PATHS = {
  portfolio:    path.join(ROOT, 'src/data/portfolio.json'),
  profile:      path.join(ROOT, 'src/data/investment-profile.json'),
  brainIndex:   path.join(ROOT, 'src/data/brain-index.json'),
  signals:      path.join(ROOT, 'src/data/signals.json'),
  aiInsights:   path.join(ROOT, 'src/data/ai-insights.json'),
}

const MODELS = {
  cheap:  'claude-haiku-4-5-20251001',
  mid:    'claude-sonnet-4-6',
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function loadJSON(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}

function enrichHolding(h) {
  const invested = h.qty * h.avg
  const value    = h.qty * h.ltp
  const pnl      = value - invested
  const pnlPct   = invested > 0 ? pnl / invested : 0
  const upside   = h.tp && h.ltp ? (h.tp - h.ltp) / h.ltp : 0
  const gap      = h.tgtVal != null ? h.tgtVal - value : null
  return { ...h, invested, value, pnl, pnlPct, upside, gap }
}

function positionSummary(h) {
  const e = enrichHolding(h)
  return {
    sym: h.sym, name: h.name, bucket: h.bucket,
    qty: h.qty, avg: Math.round(h.avg), ltp: Math.round(h.ltp),
    value: Math.round(e.value), pnl: Math.round(e.pnl),
    pnlPct: +(e.pnlPct * 100).toFixed(1),
    conv: h.conv, sl: h.sl, tp: h.tp,
    gap: e.gap != null ? Math.round(e.gap) : null,
    upside: +(e.upside * 100).toFixed(1),
    todayBuy: !!h.todayBuy,
  }
}

/** Build the critical-overrides block so the model never forgets the hard rules. */
function buildCriticalOverrides(profile) {
  const rules = profile?.keyRules ?? []
  // Keep only the hard stop/override rules, not the full list
  const hardRules = rules.filter(r =>
    /stop|override|exit|sacred|never|asianpaint|infy|liquidbees|ltf/i.test(JSON.stringify(r))
  )
  return {
    ASIANPAINT: 'tgtVal=0 — do NOT fill gap. Structural damage (market share 59→52%). Hold 100 shares, add nothing.',
    LTF:        'Intentional overweight vs advisor model. Conviction 8.8. Do not flag as error.',
    INFY:       'PA position. Hold to recovery ₹1,280–1,300, then exit cleanly.',
    LIQUIDBEES: 'Sacred crash buffer. Deploy ONLY on Nifty -8% session or VIX >25.',
    PA_STOP:    'Power Alpha hard stop -8% from entry. No exceptions. No averaging.',
    hardRules,
  }
}

/** Minimal framework — 2-3 KB, enough for weekly signal assessment. */
function buildMinimalFramework(profile) {
  return {
    convictionBands:  profile.convictionBands,
    keyRules:         profile.keyRules,
    criticalOverrides: buildCriticalOverrides(profile),
  }
}

function readOrInitInsights() {
  const existing = loadJSON(PATHS.aiInsights)
  return existing ?? {
    generatedAt: null, mode: null, refreshDue: null,
    summary: null, portfolioHealth: null,
    opportunities: [], risks: [], actionQueue: [],
    bucketInsights: [], macroOverlay: null, catalystAlerts: [],
  }
}

function writeInsights(data) {
  fs.writeFileSync(PATHS.aiInsights, JSON.stringify(data, null, 2))
}

function estimateCost(inputTokens, outputTokens, model) {
  // Approximate pricing (per 1M tokens)
  const pricing = {
    [MODELS.cheap]: { in: 0.80,  out: 4.00  },
    [MODELS.mid]:   { in: 3.00,  out: 15.00 },
  }
  const p = pricing[model] ?? pricing[MODELS.mid]
  return ((inputTokens * p.in + outputTokens * p.out) / 1_000_000).toFixed(4)
}

// ─── Mode 1: WEEKLY ───────────────────────────────────────────────────────────

const WEEKLY_TOOL = {
  name: 'write_weekly_update',
  description: 'Write this week\'s portfolio intelligence update based on the flagged signals.',
  input_schema: {
    type: 'object',
    required: ['actionQueue', 'catalystAlerts', 'weekSummary'],
    properties: {
      weekSummary: {
        type: 'string',
        description: '1-2 sentences: what matters this week and why.',
      },
      actionQueue: {
        type: 'array',
        description: 'Top actions this week, ordered by urgency. Max 5.',
        items: {
          type: 'object',
          required: ['priority', 'tag', 'stock', 'action', 'urgency'],
          properties: {
            priority: { type: 'number' },
            tag:      { type: 'string', enum: ['BUY NOW', 'BUILD', 'HEDGE', 'WATCH', 'EXIT', 'HOLD'] },
            stock:    { type: 'string' },
            action:   { type: 'string', description: 'Specific, concrete action with qty/price.' },
            urgency:  { type: 'string', enum: ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'WATCH'] },
            signal:   { type: 'string', description: 'Which signal triggered this.' },
          },
        },
      },
      catalystAlerts: {
        type: 'array',
        description: 'Upcoming catalyst events within 30 days.',
        items: {
          type: 'object',
          required: ['date', 'event', 'stocks', 'risk', 'portfolioAction'],
          properties: {
            date:            { type: 'string', description: 'YYYY-MM-DD or approximate.' },
            event:           { type: 'string' },
            stocks:          { type: 'array', items: { type: 'string' } },
            risk:            { type: 'string', enum: ['HIGH', 'MED', 'LOW', 'BINARY'] },
            portfolioAction: { type: 'string', description: 'What to do before/after this event.' },
          },
        },
      },
      stockNotes: {
        type: 'object',
        description: 'Optional per-stock note for flagged stocks that need explanation.',
        additionalProperties: {
          type: 'string',
          description: '1 sentence note on the signal and recommended response.',
        },
      },
    },
  },
}

export async function runWeekly({ dryRun = false } = {}) {
  const signals    = loadJSON(PATHS.signals)
  const portfolio  = loadJSON(PATHS.portfolio)
  const brainIndex = loadJSON(PATHS.brainIndex)
  const profile    = loadJSON(PATHS.profile)

  if (!portfolio || !profile) throw new Error('portfolio.json or investment-profile.json missing')

  const holdingBySym = Object.fromEntries(portfolio.holdings.map(h => [h.sym, h]))

  // ── No signals: zero-cost stable update ──────────────────────────────────
  if (!signals || signals.stable) {
    console.log('No signals flagged — portfolio stable. Skipping AI call.')
    const insights = readOrInitInsights()
    insights.weeklyUpdate = {
      generatedAt:  new Date().toISOString(),
      mode:         'weekly',
      stable:       true,
      weekSummary:  'No significant signals this week — portfolio stable.',
      signalCount:  0,
      flagged:      [],
      actionQueue:  insights.weeklyUpdate?.actionQueue ?? [],
      catalystAlerts: insights.weeklyUpdate?.catalystAlerts ?? [],
      stockNotes:   {},
      tokenCost:    '$0.0000',
    }
    writeInsights(insights)
    console.log('Wrote stable weekly update → src/data/ai-insights.json')
    return insights.weeklyUpdate
  }

  // ── Build payload for flagged stocks ─────────────────────────────────────
  const flaggedPayload = []
  for (const sym of signals.flagged) {
    const holding = holdingBySym[sym]
    if (!holding) continue
    const signal  = signals.stocks[sym]
    const brain   = brainIndex?.stocks[sym]

    flaggedPayload.push({
      sym,
      signals:   signal.signals,
      reasons:   signal.reasons,
      position:  positionSummary(holding),
      // Thesis — trim to key fields only (not the full 1.5KB body)
      thesis:    brain ? {
        conviction:     brain.conviction,
        actionBias:     brain.actionBias,
        bucket:         brain.bucket,
        thesisBreakers: brain.thesisBreakers,
        targets:        brain.targets,
        activeMonitors: brain.activeMonitors,
        // First 400 chars of thesis body for colour
        thesisSummary:  brain.thesis?.slice(0, 400),
      } : null,
    })
  }

  const framework  = buildMinimalFramework(profile)
  const portfolioMeta = {
    refreshDate: portfolio.meta?.refreshDate,
    totalValue:  Math.round(portfolio.holdings.reduce((s, h) => s + h.qty * h.ltp, 0)),
    weekOf:      signals.currentDate,
  }

  const systemPrompt = `You are a portfolio intelligence engine for an Indian equity investor.

Apply the following investment framework when generating this week's update:
${JSON.stringify(framework, null, 2)}

Rules:
- Be specific and actionable. Not "consider buying" but "buy 15 shares at market open Monday".
- Flag catalysts that require action BEFORE the event date.
- Never recommend adding to ASIANPAINT, never moving LIQUIDBEES stop.
- Output ONLY via the write_weekly_update tool. No prose, no preamble.`

  const userPrompt = `Portfolio: ₹${(portfolioMeta.totalValue / 100000).toFixed(1)}L as of ${portfolioMeta.refreshDate}

This week's flagged signals (${flaggedPayload.length} stocks):
${JSON.stringify(flaggedPayload, null, 2)}

Generate this week's intelligence update using the write_weekly_update tool.`

  const inputTokensEst  = Math.round((systemPrompt.length + userPrompt.length) / 4)
  const outputTokensEst = 800

  console.log(`\nWeekly intelligence scan:`)
  console.log(`  Flagged stocks: ${signals.flagged.join(', ')}`)
  console.log(`  Model: ${MODELS.cheap} (Haiku)`)
  console.log(`  Estimated input: ~${inputTokensEst} tokens`)
  console.log(`  Estimated cost: ~$${estimateCost(inputTokensEst, outputTokensEst, MODELS.cheap)}`)

  if (dryRun) {
    console.log('\n[dry-run] Skipping API call.')
    console.log('System prompt length:', systemPrompt.length, 'chars')
    console.log('User prompt length:  ', userPrompt.length, 'chars')
    return null
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n─────────────────────────────────────────────────────────')
    console.log('No ANTHROPIC_API_KEY found.')
    console.log('Paste the block below into Claude Code to generate insights:')
    console.log('─────────────────────────────────────────────────────────\n')
    console.log('Run weekly insights. Here is the context:\n')
    console.log('SYSTEM:\n' + systemPrompt)
    console.log('\nUSER:\n' + userPrompt)
    console.log('\nExpected output schema:\n' + JSON.stringify(WEEKLY_TOOL.input_schema, null, 2))
    console.log('\n─────────────────────────────────────────────────────────')
    console.log('After Claude replies, run: node scripts/tiered-insights.js --apply <paste-json-here>')
    return null
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model:      MODELS.cheap,
    max_tokens: 1500,
    system:     systemPrompt,
    tools:      [WEEKLY_TOOL],
    tool_choice: { type: 'tool', name: 'write_weekly_update' },
    messages:   [{ role: 'user', content: userPrompt }],
  })

  const toolUse = response.content.find(c => c.type === 'tool_use')
  if (!toolUse) throw new Error('Model did not call write_weekly_update tool')

  const update = toolUse.input
  const actualCost = estimateCost(
    response.usage.input_tokens,
    response.usage.output_tokens,
    MODELS.cheap,
  )

  console.log(`\n  Actual tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`)
  console.log(`  Actual cost:   $${actualCost}`)

  // ── Merge into ai-insights.json ───────────────────────────────────────────
  const now7 = new Date(); now7.setDate(now7.getDate() + 7)
  const insights = readOrInitInsights()
  insights.weeklyUpdate = {
    generatedAt:    new Date().toISOString(),
    mode:           'weekly',
    stable:         false,
    weekSummary:    update.weekSummary,
    signalCount:    signals.summary.totalFlagged,
    flagged:        signals.flagged,
    actionQueue:    update.actionQueue,
    catalystAlerts: update.catalystAlerts,
    stockNotes:     update.stockNotes ?? {},
    tokenCost:      `$${actualCost}`,
  }
  // Top-level fields the UI reads directly
  insights.actionQueue    = update.actionQueue
  insights.catalystAlerts = update.catalystAlerts
  // Mark as run so UI doesn't show "not generated" state
  // Full mode will overwrite these with its own deeper values
  if (!insights.generatedAt) {
    insights.generatedAt = new Date().toISOString()
    insights.mode        = 'weekly'
    const due = new Date(); due.setDate(due.getDate() + 7)
    insights.refreshDue  = due.toISOString().split('T')[0]
  }

  writeInsights(insights)

  console.log('\nWeekly update written → src/data/ai-insights.json')
  console.log(`  Action queue: ${update.actionQueue.length} items`)
  console.log(`  Catalyst alerts: ${update.catalystAlerts.length} items`)
  if (update.actionQueue.length) {
    console.log('\nTop actions this week:')
    update.actionQueue.slice(0, 3).forEach(a =>
      console.log(`  [${a.urgency}] ${a.stock} — ${a.action}`)
    )
  }

  return insights.weeklyUpdate
}

// ─── Mode 2: TARGETED ────────────────────────────────────────────────────────

const TARGETED_TOOL = {
  name: 'write_stock_analysis',
  description: 'Write a targeted analysis for a single stock position.',
  input_schema: {
    type: 'object',
    required: ['sym', 'verdict', 'action', 'rationale', 'risks'],
    properties: {
      sym:       { type: 'string' },
      verdict:   { type: 'string', enum: ['STRONG_BUY', 'BUY', 'HOLD', 'WATCH', 'TRIM', 'EXIT'] },
      action:    { type: 'string', description: 'Specific action with qty/price/timeline.' },
      rationale: { type: 'string', description: '2-3 sentences grounded in the thesis.' },
      risks:     { type: 'string', description: '1-2 sentences on what could go wrong.' },
      catalysts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Upcoming catalysts to watch.',
      },
      conviction: {
        type: 'number',
        description: 'Suggested conviction score (1-10) given current info.',
      },
    },
  },
}

export async function runTargeted(sym, { dryRun = false } = {}) {
  const portfolio  = loadJSON(PATHS.portfolio)
  const brainIndex = loadJSON(PATHS.brainIndex)
  const profile    = loadJSON(PATHS.profile)
  const signals    = loadJSON(PATHS.signals)

  if (!portfolio || !profile || !brainIndex) {
    throw new Error('Missing required data files')
  }

  const holding = portfolio.holdings.find(h => h.sym === sym)
  if (!holding) throw new Error(`Symbol ${sym} not found in portfolio.json`)

  const brain = brainIndex.stocks[sym]
  const signal = signals?.stocks[sym] ?? null

  const systemPrompt = `You are a portfolio analyst applying an institutional-grade investment framework.

Framework context:
${JSON.stringify(buildMinimalFramework(profile), null, 2)}

You are analysing a SPECIFIC stock. Apply the full thesis below to the current position data.
Output ONLY via the write_stock_analysis tool.`

  const userPrompt = `Stock: ${sym}

Investment thesis:
${JSON.stringify(brain ?? { note: 'No brain entry — use general framework.' }, null, 2)}

Current position:
${JSON.stringify(positionSummary(holding), null, 2)}

${signal ? `Recent signals:\n${JSON.stringify(signal, null, 2)}` : 'No recent signals.'}`

  const inputTokensEst = Math.round((systemPrompt.length + userPrompt.length) / 4)
  console.log(`\nTargeted analysis: ${sym}`)
  console.log(`  Model: ${MODELS.mid} (Sonnet)`)
  console.log(`  Estimated input: ~${inputTokensEst} tokens`)
  console.log(`  Estimated cost: ~$${estimateCost(inputTokensEst, 400, MODELS.mid)}`)

  if (dryRun) {
    console.log('\n[dry-run] Skipping API call.')
    return null
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model:       MODELS.mid,
    max_tokens:  800,
    system:      systemPrompt,
    tools:       [TARGETED_TOOL],
    tool_choice: { type: 'tool', name: 'write_stock_analysis' },
    messages:    [{ role: 'user', content: userPrompt }],
  })

  const toolUse = response.content.find(c => c.type === 'tool_use')
  if (!toolUse) throw new Error('Model did not call write_stock_analysis tool')

  const analysis  = toolUse.input
  const actualCost = estimateCost(
    response.usage.input_tokens,
    response.usage.output_tokens,
    MODELS.mid,
  )

  console.log(`  Actual tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`)
  console.log(`  Actual cost:   $${actualCost}`)
  console.log(`\n  ${sym}: ${analysis.verdict} — ${analysis.action}`)
  console.log(`  Rationale: ${analysis.rationale}`)

  // Merge into ai-insights.json weeklyUpdate.stockNotes
  const insights = readOrInitInsights()
  if (!insights.weeklyUpdate) {
    insights.weeklyUpdate = {
      generatedAt: new Date().toISOString(),
      mode: 'targeted',
      stable: false,
      flagged: [sym],
      actionQueue: [],
      catalystAlerts: [],
      stockNotes: {},
    }
  }
  insights.weeklyUpdate.stockNotes = insights.weeklyUpdate.stockNotes ?? {}
  insights.weeklyUpdate.stockNotes[sym] = {
    ...analysis,
    generatedAt: new Date().toISOString(),
    tokenCost: `$${actualCost}`,
  }

  writeInsights(insights)
  console.log(`\nTargeted analysis for ${sym} written → src/data/ai-insights.json`)

  return analysis
}

// ─── Mode 3: FULL ─────────────────────────────────────────────────────────────
// Full mode keeps all the logic from the original generate-insights.js but is
// extracted here so sync.js can call it directly if needed.

export async function runFull({ dryRun = false } = {}) {
  const profile   = loadJSON(PATHS.profile)
  const portfolio = loadJSON(PATHS.portfolio)
  if (!profile || !portfolio) throw new Error('Missing profile or portfolio')

  const holdings  = portfolio.holdings.map(enrichHolding)
  const totalVal  = holdings.reduce((s, h) => s + h.value, 0)
  const totalInv  = holdings.reduce((s, h) => s + h.invested, 0)
  const totalPnL  = totalVal - totalInv

  const bucketSummary = {}
  for (const [name, bt] of Object.entries(portfolio.bucketTargets ?? {})) {
    const bh  = holdings.filter(h => h.bucket === name)
    const val = bh.reduce((s, h) => s + h.value, 0)
    const inv = bh.reduce((s, h) => s + h.invested, 0)
    bucketSummary[name] = { val, inv, tgt: bt.target, gap: bt.target - val, pct: bt.target > 0 ? val / bt.target : 0 }
  }

  const snap = {
    refreshDate: portfolio.meta?.refreshDate,
    totalInvested: totalInv, totalValue: totalVal, totalPnL,
    roi: totalPnL / totalInv,
    buckets: bucketSummary,
    topGainers: [...holdings].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 5)
      .map(h => ({ sym: h.sym, pnlPct: h.pnlPct, pnl: h.pnl, conv: h.conv, bucket: h.bucket })),
    topLosers: [...holdings].sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 5)
      .map(h => ({ sym: h.sym, pnlPct: h.pnlPct, pnl: h.pnl, conv: h.conv, bucket: h.bucket })),
    gapStocks: holdings
      .filter(h => h.gap != null && h.gap > 30000 && h.sym !== 'ASIANPAINT')
      .sort((a, b) => b.gap - a.gap).slice(0, 12)
      .map(h => ({ sym: h.sym, name: h.name, bucket: h.bucket, conv: h.conv, gap: h.gap,
                   upside: h.upside, note: h.note })),
    lowConvHighSize: holdings
      .filter(h => h.conv <= 5 && h.value > 100000)
      .map(h => ({ sym: h.sym, conv: h.conv, value: h.value, bucket: h.bucket })),
  }

  const inputTokensEst = Math.round((JSON.stringify(profile).length + JSON.stringify(snap).length) / 4)
  console.log(`\nFull portfolio reanalysis`)
  console.log(`  Holdings: ${holdings.length} | Value: ₹${(totalVal/100000).toFixed(1)}L`)
  console.log(`  Model: ${MODELS.mid} (Sonnet)`)
  console.log(`  Estimated input: ~${inputTokensEst} tokens`)
  console.log(`  Estimated cost: ~$${estimateCost(inputTokensEst, 4000, MODELS.mid)}`)

  if (dryRun) {
    console.log('\n[dry-run] Skipping API call.')
    return null
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')

  const systemPrompt = `You are the portfolio analysis engine for an Indian equity investor.

Investment profile:
${JSON.stringify(profile, null, 2)}

Apply every relevant section. Output ONLY valid JSON matching the provided schema. No markdown.`

  const userPrompt = `Portfolio snapshot (${portfolio.meta?.refreshDate}):
${JSON.stringify(snap, null, 2)}

Full holdings:
${JSON.stringify(holdings.map(positionSummary), null, 2)}

Generate insights in exactly this JSON format:
{
  "generatedAt": "ISO timestamp",
  "refreshDue": "ISO date 90 days from now",
  "mode": "full",
  "summary": "2-3 sentence portfolio health summary",
  "portfolioHealth": {
    "totalValue": number, "totalInvested": number, "totalPnL": number,
    "roi": number, "highConvPositions": number,
    "bucketCompletion": { "bucketName": percentage }
  },
  "opportunities": [{ "rank": 1, "stock": "sym", "name": "...", "bucket": "...",
    "conviction": number, "gap": number, "addQty": number,
    "action": "BUY|ADD|BUILD", "rationale": "...", "catalyst": "...",
    "timeline": "12M|36M", "priority": 1 }],
  "risks": [{ "stock": "sym", "issue": "...", "severity": "HIGH|MED|LOW",
    "action": "...", "context": "..." }],
  "actionQueue": [{ "priority": 1, "tag": "BUY NOW|BUILD|HEDGE|WATCH|EXIT",
    "stock": "sym", "action": "...", "urgency": "TODAY|THIS_WEEK|THIS_MONTH|WATCH" }],
  "bucketInsights": [{ "bucket": "...", "status": "on track|underfunded|overfunded", "insight": "..." }],
  "macroOverlay": { "niftyLevel": "...", "fiiFlow": "...", "vix": "low|normal|elevated|high",
    "deploymentMode": "defensive|systematic|aggressive", "insight": "..." },
  "catalystAlerts": [{ "date": "YYYY-MM-DD", "event": "...", "risk": "HIGH|MED|LOW|BINARY",
    "stocks": ["sym"], "portfolioAction": "..." }]
}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  console.log('\nCalling Claude Sonnet with full investment profile...')
  const response = await client.messages.create({
    model:      MODELS.mid,
    max_tokens: 4000,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  const rawText = response.content[0].text
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const result  = JSON.parse(cleaned)

  const actualCost = estimateCost(response.usage.input_tokens, response.usage.output_tokens, MODELS.mid)
  console.log(`  Tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`)
  console.log(`  Cost:   $${actualCost}`)

  result.generatedAt = new Date().toISOString()
  const due = new Date(); due.setDate(due.getDate() + 90)
  result.refreshDue  = due.toISOString().split('T')[0]
  result.mode        = 'full'
  result.tokenCost   = `$${actualCost}`

  writeInsights(result)

  console.log('\nFull insights written → src/data/ai-insights.json')
  console.log(`  Opportunities: ${result.opportunities?.length ?? 0}`)
  console.log(`  Risks:         ${result.risks?.length ?? 0}`)
  console.log(`  Action items:  ${result.actionQueue?.length ?? 0}`)
  console.log(`  Catalysts:     ${result.catalystAlerts?.length ?? 0}`)

  return result
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args    = process.argv.slice(2)
  const dryRun  = args.includes('--dry-run')
  const full    = args.includes('--full')
  const stockIdx = args.indexOf('--stock')
  const stockSym = stockIdx !== -1 ? args[stockIdx + 1]?.toUpperCase() : null

  let run
  if (full)       run = runFull({ dryRun })
  else if (stockSym) run = runTargeted(stockSym, { dryRun })
  else            run = runWeekly({ dryRun })

  run.catch(err => {
    console.error('Error:', err.message)
    process.exitCode = 1
  })
}
