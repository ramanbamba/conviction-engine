#!/usr/bin/env node
/**
 * print-alpha.js — rank the live book through the alpha model (the core IP).
 * Consumed by morning-brief generation and any loop that needs the machine view.
 *   npm run alpha
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { rankBook } from '../src/lib/alphaModel.js'

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
const j = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'))

const rows = rankBook(j('portfolio.json').holdings, j('fundamentals.json'), j('insights.json'), j('ai-insights.json'))

console.log('\nALPHA MODEL — machine view of the book (see ALPHA_MODEL.md)\n')
console.log('SYM          α    TIER      Q   M   G   V   S   gates      conv  driver/risk')
console.log('─'.repeat(92))
for (const r of rows) {
  const m = r.model
  const g = (m.gates.gov * m.gates.eq).toFixed(2)
  console.log(
    r.sym.padEnd(12),
    String(m.score).padStart(3), '',
    m.tier.padEnd(9),
    ...['Q', 'M', 'G', 'V', 'S'].map(k => String(m.sleeves[k] ?? '—').padStart(3) + ' '),
    ('×' + g).padEnd(10),
    String(r.conv ?? '—').padStart(4), '',
    `${m.driver} / ${m.risk}`
  )
}
const div = rows.filter(r => r.conv != null && ((r.model.score >= 70 && r.conv < 6) || (r.model.score < 40 && r.conv >= 7)))
if (div.length) {
  console.log('\nMACHINE vs HUMAN divergence (≥2 notch):')
  for (const r of div) console.log(`  ${r.sym}: model ${r.model.score} (${r.model.tier}) vs your conv ${r.conv}`)
}
console.log('')
