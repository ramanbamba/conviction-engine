/**
 * generate-insights.js
 *
 * Reads investment-profile.json + portfolio.json → calls Claude API → writes ai-insights.json
 *
 * Usage:
 *   npm run insights                    # generate strategic portfolio insights
 *   node scripts/generate-insights.js   # same
 *
 * Requires: ANTHROPIC_API_KEY in .env
 *
 * Output: src/data/ai-insights.json — strategic view (opportunities, risks, action queue, macro)
 * Separate from insights.json (per-position technical/fundamental seed)
 *
 * Multi-user note: investment-profile.json is the structured user brain.
 * At scale, each user has their own profile — the AI reads that, not a hardcoded markdown file.
 */

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const PROFILE_PATH   = path.join(ROOT, 'src/data/investment-profile.json')
const PORTFOLIO_PATH = path.join(ROOT, 'src/data/portfolio.json')
const OUT_PATH       = path.join(ROOT, 'src/data/ai-insights.json')

// ─── Validate env ────────────────────────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set. Add it to .env (see .env.example)')
  process.exit(1)
}

// ─── Load inputs ─────────────────────────────────────────────────────────────
const profile   = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'))
const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'))

// ─── Compute derived metrics ─────────────────────────────────────────────────
function enrichHoldings(holdings) {
  return holdings.map(h => {
    const invested = h.qty * h.avg
    const value    = h.qty * h.ltp
    const pnl      = value - invested
    const pnlPct   = invested > 0 ? pnl / invested : 0
    const upside   = h.tp && h.ltp ? (h.tp - h.ltp) / h.ltp : 0
    const gap      = h.tgtVal != null ? h.tgtVal - value : null
    return { ...h, invested, value, pnl, pnlPct, upside, gap }
  })
}

const holdings  = enrichHoldings(portfolio.holdings)
const totalVal  = holdings.reduce((s, h) => s + h.value, 0)
const totalInv  = holdings.reduce((s, h) => s + h.invested, 0)
const totalPnL  = totalVal - totalInv

const bucketSummary = {}
Object.keys(portfolio.bucketTargets || {}).forEach(name => {
  const bh  = holdings.filter(h => h.bucket === name)
  const val = bh.reduce((s, h) => s + h.value, 0)
  const inv = bh.reduce((s, h) => s + h.invested, 0)
  const tgt = portfolio.bucketTargets[name].target
  bucketSummary[name] = { val, inv, tgt, gap: tgt - val, pct: tgt > 0 ? val / tgt : 0 }
})

const snapshot = {
  refreshDate:    portfolio.meta?.refreshDate,
  totalInvested:  totalInv,
  totalValue:     totalVal,
  totalPnL,
  roi:            totalPnL / totalInv,
  buckets:        bucketSummary,
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

// ─── Prompts ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the portfolio analysis engine for an Indian equity investor.

The following is the user's structured InvestmentProfile — their personal framework including philosophy, conviction dimensions, bucket architecture, key rules, active monitors, and known mistake patterns. Apply every relevant section when generating insights.

<investment_profile>
${JSON.stringify(profile, null, 2)}
</investment_profile>

You must generate insights that:
1. Apply the user's 10-dimension conviction scoring system
2. Flag bucket gaps against their ₹1.25Cr target architecture
3. Identify opportunities sorted by conviction × gap size
4. Apply the macro framework (FII 5 triggers, VIX deployment rules)
5. Surface active monitors as catalyst alerts (use the exact dates and actions from activeMonitors)
6. Flag risk positions using the user's known mistake patterns (especially pa_to_lt_conversion, execution_lag, thesis_decay)
7. Apply all bucket-specific overrides (ASIANPAINT tgtVal=0, INFY exit plan, LIQUIDBEES sacred buffer rules)
8. Reference the conviction bands to validate each opportunity's action bias

Output ONLY valid JSON matching the schema provided. No markdown, no preamble, no explanation.`

const USER_PROMPT = `Current portfolio snapshot (${portfolio.meta?.refreshDate}):

${JSON.stringify(snapshot, null, 2)}

Full holdings data:
${JSON.stringify(holdings.map(h => ({
  sym: h.sym, name: h.name, qty: h.qty, avg: Math.round(h.avg), ltp: Math.round(h.ltp),
  bucket: h.bucket, conv: h.conv, tp: h.tp, sl: h.sl, value: Math.round(h.value),
  pnl: Math.round(h.pnl), pnlPct: +(h.pnlPct * 100).toFixed(1),
  gap: h.gap != null ? Math.round(h.gap) : null,
  upside: +(h.upside * 100).toFixed(1), note: h.note
})), null, 2)}

Generate portfolio insights in this exact JSON format:
{
  "generatedAt": "ISO timestamp",
  "refreshDue": "ISO date 30 days from now",
  "summary": "2-3 sentence portfolio health summary applying Investment Brain frameworks",
  "portfolioHealth": {
    "totalValue": number,
    "totalInvested": number,
    "totalPnL": number,
    "roi": number,
    "highConvPositions": number,
    "bucketCompletion": { "bucketName": percentage }
  },
  "opportunities": [
    {
      "rank": 1,
      "stock": "sym",
      "name": "full name",
      "bucket": "bucket",
      "conviction": number,
      "gap": number,
      "addQty": number,
      "action": "BUY|ADD|BUILD",
      "rationale": "specific rationale from Investment Brain thesis, 1-2 sentences",
      "catalyst": "specific catalyst from brain",
      "timeline": "12M|36M",
      "priority": 1-5
    }
  ],
  "risks": [
    {
      "stock": "sym",
      "issue": "specific issue",
      "severity": "HIGH|MED|LOW",
      "action": "specific action",
      "context": "reference to relevant brain section"
    }
  ],
  "actionQueue": [
    {
      "priority": 1,
      "tag": "BUY NOW|BUILD|HEDGE|WATCH|EXIT",
      "stock": "sym",
      "action": "specific action from Investment Brain decision rules",
      "impact": "financial impact estimate",
      "color": "#hex color"
    }
  ],
  "bucketInsights": [
    {
      "bucket": "name",
      "status": "on track|underfunded|overfunded",
      "insight": "specific insight applying bucket rules from Investment Brain"
    }
  ],
  "macroOverlay": {
    "niftyLevel": "current context",
    "fiiFlow": "current direction",
    "vix": "low|normal|elevated|high",
    "deploymentMode": "defensive|systematic|aggressive",
    "insight": "macro insight from Investment Brain macro framework"
  },
  "catalystAlerts": [
    {
      "date": "YYYY-MM-DD",
      "event": "event name",
      "risk": "HIGH|MED|LOW|BINARY",
      "stocks": ["sym1"],
      "portfolioAction": "what to do before/after"
    }
  ]
}`

// ─── Main ─────────────────────────────────────────────────────────────────────
async function generateInsights() {
  console.log(`Reading investment profile (${profile.displayName}) + portfolio data...`)
  console.log(`Portfolio: ₹${(totalVal/100000).toFixed(2)}L | P&L: ${totalPnL >= 0 ? '+' : ''}₹${(totalPnL/100000).toFixed(2)}L | ${holdings.length} positions`)
  console.log(`Profile: ${profile.buckets.length} buckets, ${profile.convictionDimensions.length} dimensions, ${profile.activeMonitors.length} monitors`)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  console.log('\nCalling Claude claude-sonnet-4-5-20251001 with Investment Brain context...')

  const response = await client.messages.create({
    model:      'claude-sonnet-4-5-20251001',
    max_tokens: 4000,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: USER_PROMPT }]
  })

  const rawText = response.content[0].text
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const insights = JSON.parse(cleaned)

  // Stamp generation metadata
  insights.generatedAt = new Date().toISOString()
  const due = new Date(); due.setDate(due.getDate() + 30)
  insights.refreshDue  = due.toISOString().split('T')[0]

  fs.writeFileSync(OUT_PATH, JSON.stringify(insights, null, 2))

  console.log(`\nInsights written to src/data/ai-insights.json`)
  console.log(`  Opportunities: ${insights.opportunities?.length || 0}`)
  console.log(`  Risks:         ${insights.risks?.length || 0}`)
  console.log(`  Action items:  ${insights.actionQueue?.length || 0}`)
  console.log(`  Catalysts:     ${insights.catalystAlerts?.length || 0}`)

  if (insights.opportunities?.length > 0) {
    console.log('\nTop 3 opportunities:')
    insights.opportunities.slice(0, 3).forEach((o, i) => {
      console.log(`  ${i+1}. ${o.name} (${o.bucket}) — ${o.action} ₹${(o.gap/100000).toFixed(2)}L gap | Conv ${o.conviction}`)
    })
  }

  const highRisks = insights.risks?.filter(r => r.severity === 'HIGH') || []
  if (highRisks.length > 0) {
    console.log('\nHigh severity risks:')
    highRisks.forEach(r => console.log(`  ${r.stock}: ${r.issue}`))
  }
}

generateInsights().catch(err => {
  console.error('Error generating insights:', err.message)
  process.exit(1)
})
