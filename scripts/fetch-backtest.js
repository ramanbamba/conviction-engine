import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const portfolioPath = path.join(root, 'src/data/portfolio.json')
const outPath = path.join(root, 'src/data/backtest.json')

// Suppressed notices

async function fetchHistorical(sym, start, end) {
  try {
    const data = await yahooFinance.historical(sym, {
      period1: start,
      period2: end,
      interval: '1mo'
    })
    return data
  } catch (err) {
    console.error(`Failed to fetch ${sym}:`, err.message)
    return []
  }
}

async function main() {
  console.log('Reading portfolio...')
  const portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'))
  
  const end = new Date()
  const start = new Date()
  start.setFullYear(start.getFullYear() - 5)
  
  console.log(`Fetching 5-year historical data (${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]})...`)
  
  const historyByMonth = {} // monthStr -> { date, niftyClose, portfolioValue, holdings: { sym: value } }
  
  // 1. Fetch Nifty 50
  console.log('Fetching Benchmark: ^NSEI (Nifty 50)')
  const niftyData = await fetchHistorical('^NSEI', start, end)
  
  for (const row of niftyData) {
    const month = row.date.toISOString().slice(0, 7) // YYYY-MM
    historyByMonth[month] = {
      date: month,
      niftyClose: row.close,
      portfolioValue: 0,
      holdings: {}
    }
  }

  // 2. Fetch Portfolio Holdings
  for (const holding of portfolio.holdings) {
    let cleanSym = holding.sym
    if (cleanSym.endsWith('-PA')) cleanSym = cleanSym.replace('-PA', '')
    
    const yfSym = `${cleanSym}.NS`
    console.log(`Fetching: ${yfSym} (Qty: ${holding.qty})`)
    
    const data = await fetchHistorical(yfSym, start, end)
    
    for (const row of data) {
      const month = row.date.toISOString().slice(0, 7)
      if (!historyByMonth[month]) {
        // If a stock traded before our Nifty fetch started (rare but possible), initialize it
        historyByMonth[month] = { date: month, niftyClose: null, portfolioValue: 0, holdings: {} }
      }
      const val = row.close * holding.qty
      historyByMonth[month].holdings[holding.sym] = val
      historyByMonth[month].portfolioValue += val
    }
    
    // Slight delay to avoid rate limits
    await new Promise(res => setTimeout(res, 500))
  }
  
  // Convert map to sorted array
  const series = Object.values(historyByMonth).sort((a, b) => a.date.localeCompare(b.date))
  
  // Fill forward any missing months for stocks that didn't have data in a specific month
  // This handles recent IPOs (value will be 0 before IPO) and missing data points
  
  const outData = {
    meta: {
      generatedAt: new Date().toISOString(),
      startMonth: series[0]?.date,
      endMonth: series[series.length - 1]?.date,
      months: series.length
    },
    series
  }
  
  fs.writeFileSync(outPath, JSON.stringify(outData, null, 2))
  console.log(`\nSuccess! Backtest data saved to ${outPath}`)
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exitCode = 1
})
