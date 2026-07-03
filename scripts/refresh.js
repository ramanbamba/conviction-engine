import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { runRefresh } from '../lib/sync/engine.js'
import { buildHistory } from './build-history.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const portfolioPath = path.join(root, 'src/data/portfolio.json')
const holdingsPath = path.join(root, 'data/kite/holdings.json')
const positionsPath = path.join(root, 'data/kite/positions.json')
const snapshotsDir = path.join(root, 'data/snapshots')

function parseArgs(argv) {
  const out = {
    dryRun: false,
    actor: 'npm run refresh',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') out.dryRun = true
    if (arg === '--actor' && argv[i + 1]) {
      out.actor = argv[i + 1]
      i += 1
    }
  }
  return out
}

function assertKiteFeedPresent(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label} feed: ${filePath}`)
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} feed should be a JSON array: ${filePath}`)
  }
  return parsed.length
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const holdingsCount = assertKiteFeedPresent(holdingsPath, 'holdings')
    const positionsCount = assertKiteFeedPresent(positionsPath, 'positions')

    const out = runRefresh({
      portfolioPath,
      holdingsPath,
      positionsPath,
      snapshotsDir,
      actor: args.actor,
      dryRun: args.dryRun,
    })

    const historyCount = buildHistory()

    console.log(out.dryRun ? 'Dry run complete (no files written)' : 'Refresh complete')
    console.log(`Input holdings rows: ${holdingsCount}`)
    console.log(`Input positions rows: ${positionsCount}`)
    console.log(`Portfolio: ${out.portfolioPath}`)
    if (out.snapshotPath) console.log(`Snapshot:  ${out.snapshotPath}`)
    console.log(`History:   Rebuilt with ${historyCount} days`)
    console.log(`Changed:   ${out.totals.changedHoldings}`)
    console.log(`Unchanged: ${out.totals.unchangedHoldings}`)
    console.log(`Skipped:   ${out.totals.skippedFromFeed}`)
  } catch (error) {
    console.error(error.message || error)
    process.exitCode = 1
  }
}

main()
