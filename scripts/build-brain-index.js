/**
 * build-brain-index.js
 *
 * Parses INVESTMENT_BRAIN.md into two machine-readable indexes:
 *
 *   src/data/brain-index.json   — per-stock entries, keyed by portfolio sym
 *   src/data/brain-global.json  — global framework sections (philosophy,
 *                                  conviction system, macro, sector rules, etc.)
 *
 * The tiered AI pipeline loads only brain-index[sym] (~1-3 KB) for targeted
 * stock analysis, rather than the full 42 KB brain. brain-global.json is used
 * only for full quarterly reanalysis.
 *
 * Rebuild whenever INVESTMENT_BRAIN.md changes:
 *   npm run brain:index
 *
 * Downstream scripts check meta.brainChecksum and skip rebuild if unchanged.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT       = path.join(__dirname, '..')
const BRAIN_PATH = path.join(ROOT, 'INVESTMENT_BRAIN.md')
const INDEX_OUT  = path.join(ROOT, 'src/data/brain-index.json')
const GLOBAL_OUT = path.join(ROOT, 'src/data/brain-global.json')

// ─── Portfolio sym → brain header name (where they differ) ───────────────────
// Brain uses full names or alternate spellings for some stocks.
// Maps portfolio.json sym → the identifier used as the brain section header.
const PORTFOLIO_TO_BRAIN = {
  'KEC':       'KEC INTERNATIONAL',
  'MARUTI':    'MARUTI SUZUKI',
  'MARUTI-PA': 'MARUTI SUZUKI',   // shares the brain entry with MARUTI
  'KAYNES':    'KAYNES TECHNOLOGY',
  'AMBER':     'AMBER ENTERPRISES',
  'JYOTHYLAB': 'JYOTHY LABS',
}

// Inverted: brain header → canonical portfolio sym (first appearance wins)
const BRAIN_TO_PORTFOLIO = {}
for (const [portSym, brainSym] of Object.entries(PORTFOLIO_TO_BRAIN)) {
  if (!BRAIN_TO_PORTFOLIO[brainSym]) BRAIN_TO_PORTFOLIO[brainSym] = portSym
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex')
}

/** Extract a named numbered section from the brain text. */
function extractSection(brainText, num) {
  const re    = /^## SECTION\s+(\d+):/gm
  const hits  = [...brainText.matchAll(re)]
  const start = hits.find(m => parseInt(m[1]) === num)
  const end   = hits.find(m => parseInt(m[1]) === num + 1)
  if (!start) return ''
  const s = start.index + start[0].length
  const e = end ? end.index : brainText.length
  return brainText.slice(s, e).trim()
}

/** Parse the `### HEADER` line of a stock section. */
function parseStockHeader(headerLine) {
  // Remove leading ###
  const raw = headerLine.replace(/^###\s*/, '').trim()

  // Bucket: first pipe-delimited segment after sym/name
  const parts       = raw.split('|')
  const namePart    = parts[0].trim()   // "WABAG — VA Tech Wabag" or "KEC INTERNATIONAL"
  const bucketPart  = parts[1]?.trim()  // "STARS" or "PLATINUM + POWER ALPHA"
  const convPart    = parts[2]?.trim()  // "Conviction: 9.2/10"

  let sym, name
  if (namePart.includes(' — ')) {
    const [s, n] = namePart.split(' — ')
    sym  = s.trim()
    name = n.trim()
  } else {
    sym  = namePart  // full name used as sym in brain (e.g., "KEC INTERNATIONAL")
    name = namePart
  }

  const convMatch = convPart?.match(/Conviction:\s*([\d.]+)/)
  const conviction = convMatch ? parseFloat(convMatch[1]) : null

  return { sym, name, bucket: bucketPart ?? null, conviction }
}

function actionBias(conviction) {
  if (!conviction) return 'UNKNOWN'
  if (conviction >= 9.0) return 'STRONG_BUY'
  if (conviction >= 7.5) return 'BUY'
  if (conviction >= 6.0) return 'HOLD'
  if (conviction >= 4.0) return 'WATCH'
  return 'EXIT'
}

/** Pull out lines that describe catalysts or dated events. */
function extractCatalysts(body) {
  const cats = []
  for (const line of body.split('\n')) {
    // Strip markdown bold/italic markers and leading list chars
    const clean = line.replace(/\*\*/g, '').replace(/^\*|\*$/g, '').replace(/^-\s*/, '').trim()
    if (clean.length < 15 || clean.length > 300) continue
    if (/(?:Q[1-4]\s*(?:FY|results|FY2[0-9])|results\s*~?\s*(?:May|June|July|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr)|record\s+date|pledge\s+release|catalyst|bonus\s+record|May\s+\d{1,2}|~(?:May|June|July|March|April|Jan|Feb)|RoA.*FY|EPS\s+confirm|~March\s+202|COD\s+announce|post-COD)/i.test(clean)) {
      cats.push(clean)
    }
  }
  return [...new Set(cats)]
}

/** Extract downside/risk text: "What breaks the thesis", "The binary", or "Concern" blocks. */
function extractThesisBreakers(body) {
  // Try each pattern in priority order; return first match found
  const patterns = [
    /\*\*What breaks the thesis\*\*[:\s]*([^\n]+(?:\n(?!\n)[^\n]+)*)/i,
    /\*\*The binary\*\*[:\s]*([^\n]+(?:\n(?!\n(?:#|\*\*[A-Z]))[^\n]+)*)/i,
    /\*\*(?:Concern|The concern|Risk)[:\s]*\*\*([^\n]+(?:\n(?!\n)[^\n]+)*)/i,
  ]
  for (const re of patterns) {
    const m = body.match(re)
    if (m) return m[1].replace(/\*\*/g, '').trim()
  }
  return null
}

/** Extract 12M and 36M targets. Handles "12M", "36M", and "36-month" label variants. */
function extractTargets(body) {
  const t = {}
  // Must contain a ₹ price or number range to be a valid target
  const hasPrice = /(?:₹[\d,]+|[\d,]+[-–][\d,]+)/
  // "12M target:", "12M targets:" — stop before ". Our" to avoid cross-contamination
  const m12 = body.match(/\*?\*?12[- ]?(?:M|month)[^:\n]*:[*\s]*([^\n]*)/i)
  const m36 = body.match(/\*?\*?36[- ]?(?:M|month)[^:\n]*:[*\s]*([^\n]*)/i)
  if (m12 && hasPrice.test(m12[1])) {
    // Strip any trailing "Our 36M/36-month..." suffix from 12M line
    t['12m'] = m12[1].replace(/\*\*/g, '').replace(/\.\s*(?:Our\s+)?36[- ]?(?:M|month).*/i, '').trim()
  }
  if (m36 && hasPrice.test(m36[1])) {
    t['36m'] = m36[1].replace(/\*\*/g, '').trim()
  }
  return Object.keys(t).length ? t : null
}

/** Extract conviction score breakdown line (e.g., "EG:8, BS:10, ..."). */
function extractConvictionBreakdown(body) {
  const m = body.match(/(?:Conviction score[^:]*:|score breakdown)[^:]*:([^\n]+→[^\n]+)/i)
  return m ? m[1].trim() : null
}

/** Extract main concern block. */
function extractConcern(body) {
  const m = body.match(/\*\*(?:The concern|Concern)[:\s]*\*\*([^\n]+(?:\n(?![\n#]).*)*)/i)
  return m ? m[1].replace(/\*\*/g, '').trim() : null
}

/**
 * Parse Section 11 (Active Monitors) and return a map of brainSym → monitor lines.
 * Handles both ALL-CAPS syms ("HAL Q4...") and mixed-case names ("Wabag Q4...").
 * Requires the built stocksByBrainSym map to resolve mixed-case names.
 */
function parseActiveMonitors(section11Text, stocksByBrainSym) {
  // Build lookup: every known prefix → brainSym
  // Includes: full sym (WABAG), first word of company name (Wabag → WABAG),
  //           and first two words for names like "Techno Electric" → TECHNOE
  const lookup = {}
  for (const [brainSym, entry] of Object.entries(stocksByBrainSym)) {
    lookup[brainSym.toUpperCase()] = brainSym
    const words = entry.name.split(/\s+/)
    if (words[0]) lookup[words[0].toUpperCase()] = brainSym
    if (words[1]) lookup[(words[0] + ' ' + words[1]).toUpperCase()] = brainSym
  }

  const byBrainSym = {}
  for (const line of section11Text.split('\n')) {
    const clean = line.replace(/^-\s*/, '').trim()
    if (!clean || clean.startsWith('#')) continue

    // Try matching first token, then first two tokens (for "Techno Electric...")
    const tokens = clean.split(/[:\s]/)
    const one  = tokens[0]?.toUpperCase()
    const two  = (tokens[0] + ' ' + tokens[1]).toUpperCase()
    const sym  = lookup[two] ?? lookup[one]

    if (sym) {
      if (!byBrainSym[sym]) byBrainSym[sym] = []
      byBrainSym[sym].push(clean)
    }
  }
  return byBrainSym
}

// ─── Main parse ───────────────────────────────────────────────────────────────

const brainText = fs.readFileSync(BRAIN_PATH, 'utf8')
const checksum  = md5(brainText)
const now       = new Date().toISOString()

console.log(`Parsing INVESTMENT_BRAIN.md (${(brainText.length / 1024).toFixed(1)} KB, md5: ${checksum.slice(0, 8)}…)`)

// ── Global sections ──────────────────────────────────────────────────────────
const globalSections = {
  philosophy:          extractSection(brainText, 1),
  convictionFramework: extractSection(brainText, 2),
  bucketArchitecture:  extractSection(brainText, 3),
  macroOverlay:        extractSection(brainText, 5),
  sectorFrameworks:    extractSection(brainText, 6),
  advisorModel:         extractSection(brainText, 7),
  decisionRules:       extractSection(brainText, 8),
  goldSilverFramework: extractSection(brainText, 9),
  mistakes:            extractSection(brainText, 10),
  activeMonitors:      extractSection(brainText, 11),
  insightsProcess:     extractSection(brainText, 12),
}

// ── Per-stock sections (Section 4) ──────────────────────────────────────────
const section4 = extractSection(brainText, 4)
const stocksByBrainSym = {}

// Locate every stock header by finding ### lines containing "| Conviction:"
// This is more robust than splitting by "---", which breaks for the first entry
const stockHeaderRe = /^(### [^\n]+\|\s*Conviction:[^\n]+)$/gm
const headerMatches = [...section4.matchAll(stockHeaderRe)]

for (let i = 0; i < headerMatches.length; i++) {
  const hMatch    = headerMatches[i]
  const headerEnd = hMatch.index + hMatch[0].length
  const bodyEnd   = i + 1 < headerMatches.length
    ? headerMatches[i + 1].index
    : section4.length

  // Trim trailing "---" separators from body
  const body = section4
    .slice(headerEnd, bodyEnd)
    .replace(/\n---\s*$/m, '')
    .trim()

  const { sym: brainSym, name, bucket, conviction } = parseStockHeader(hMatch[1])
  if (!conviction) continue

  stocksByBrainSym[brainSym] = {
    brainSym,
    name,
    bucket,
    conviction,
    actionBias:          actionBias(conviction),
    thesis:              body,
    catalysts:           extractCatalysts(body),
    thesisBreakers:      extractThesisBreakers(body),
    targets:             extractTargets(body),
    convictionBreakdown: extractConvictionBreakdown(body),
    concern:             extractConcern(body),
    activeMonitors:      [],
  }
}

// ── Merge active monitors into per-stock entries ─────────────────────────────
const monitorsMap = parseActiveMonitors(globalSections.activeMonitors, stocksByBrainSym)
for (const [brainSym, lines] of Object.entries(monitorsMap)) {
  if (stocksByBrainSym[brainSym]) {
    stocksByBrainSym[brainSym].activeMonitors = lines
  }
}

// ── Build portfolio-sym keyed index (with aliases) ───────────────────────────
// Each key is the sym used in portfolio.json, value is the stock entry.
const stocksByPortSym = {}

for (const [brainSym, entry] of Object.entries(stocksByBrainSym)) {
  // If there's a canonical portfolio sym for this brain sym, use it
  const portSym = BRAIN_TO_PORTFOLIO[brainSym] ?? brainSym
  stocksByPortSym[portSym] = { ...entry, sym: portSym }
}

// For portfolio syms that share a brain entry (e.g., MARUTI-PA → MARUTI SUZUKI),
// add a lightweight alias pointing to the same data
for (const [portSym, brainSym] of Object.entries(PORTFOLIO_TO_BRAIN)) {
  if (stocksByPortSym[portSym]) continue  // already mapped above
  const canonPortSym = BRAIN_TO_PORTFOLIO[brainSym]
  if (canonPortSym && stocksByPortSym[canonPortSym]) {
    stocksByPortSym[portSym] = {
      ...stocksByPortSym[canonPortSym],
      sym:     portSym,
      aliasOf: canonPortSym,
    }
  }
}

// ── Summaries ────────────────────────────────────────────────────────────────
const stockCount    = Object.keys(stocksByPortSym).length
const coveredSyms   = Object.keys(stocksByPortSym).sort()
const avgConviction = (
  Object.values(stocksByBrainSym).reduce((s, e) => s + (e.conviction ?? 0), 0) /
  Object.keys(stocksByBrainSym).length
).toFixed(2)

console.log(`  Found ${Object.keys(stocksByBrainSym).length} stock sections → ${stockCount} portfolio-sym entries`)
console.log(`  Covered syms: ${coveredSyms.join(', ')}`)
console.log(`  Avg conviction: ${avgConviction}`)

// ─── Write outputs ────────────────────────────────────────────────────────────

const brainIndex = {
  meta: {
    generatedAt:   now,
    brainChecksum: checksum,
    stockCount,
    coveredSyms,
    avgConviction: parseFloat(avgConviction),
    source:        'INVESTMENT_BRAIN.md',
  },
  stocks: stocksByPortSym,
}

const brainGlobal = {
  meta: {
    generatedAt:   now,
    brainChecksum: checksum,
    source:        'INVESTMENT_BRAIN.md',
    note:          'Global framework sections. Use only for full quarterly reanalysis — pass targeted brain-index[sym] for weekly/on-demand analysis.',
    sizeKB:        (JSON.stringify(globalSections).length / 1024).toFixed(1),
  },
  ...globalSections,
}

fs.writeFileSync(INDEX_OUT,  JSON.stringify(brainIndex,  null, 2))
fs.writeFileSync(GLOBAL_OUT, JSON.stringify(brainGlobal, null, 2))

const indexKB  = (fs.statSync(INDEX_OUT).size  / 1024).toFixed(1)
const globalKB = (fs.statSync(GLOBAL_OUT).size / 1024).toFixed(1)

console.log(`\n  brain-index.json  → ${indexKB} KB  (${INDEX_OUT})`)
console.log(`  brain-global.json → ${globalKB} KB  (${GLOBAL_OUT})`)
console.log(`\nDone. Token budget per targeted call: ~${indexKB} KB vs ${(brainText.length / 1024).toFixed(1)} KB full brain.`)
