/**
 * sources.js — the data-source registry for the intelligence pipeline.
 *
 * Single source of truth for WHERE every kind of update comes from, so each
 * fetcher (and any future one) references one map instead of hard-coding URLs.
 *
 * Two exports:
 *   UPDATE_SOURCES — per update-type: provider, url pattern, script, cadence, status
 *   STOCK_SOURCES  — per-stock identifiers: news query name, BSE code, NSE sym, IR page
 *
 * Plus detection helpers (isResultsFiling, isTranscriptFiling, isRatingHeadline)
 * and INGEST_SYMS (canonical stock list, ETFs/dupes excluded).
 *
 * Status legend: LIVE = wired & running · SEEDED = data present, fetcher external
 *                PLANNED = source mapped, fetcher not built yet
 */

// ── Detection regexes (shared across fetchers + the rescore brain) ──
export const RESULTS_RE    = /\b(q[1-4]\s*(fy)?\d*|quarter(ly)?|results|net profit|net sales|pat|revenue|earnings|ebitda|margin|topline|bottomline)\b/i
export const TRANSCRIPT_RE = /\b(transcript|earnings call|con(?:ference)?\s*call|concall|investor (?:meet|call|presentation)|analyst meet)\b/i
export const ORDER_RE      = /\b(order|contract|wins|bags|secures|awarded|loi|letter of intent|bagged|order book)\b/i
export const RATING_RE     = /\b(upgrade|downgrade|initiate|initiat|reiterate|maintain|target price|price target|raises target|cuts target|buy rating|sell rating|outperform|underperform|overweight|underweight|accumulate|reduce|add rating|neutral rating|top pick)\b/i

export const BROKERS = [
  'nuvama', 'jefferies', 'morgan stanley', 'clsa', 'motilal oswal', 'kotak',
  'icici securities', 'icici sec', 'jm financial', 'nomura', 'ubs', 'citi',
  'macquarie', 'investec', 'antique', 'emkay', 'axis', 'hsbc', 'goldman',
  'bofa', 'jpmorgan', 'jp morgan', 'bernstein', 'prabhudas', 'sharekhan',
  'anand rathi', 'systematix', 'phillipcapital', 'incred', 'elara',
  'centrum', 'iifl', 'yes securities', 'dolat', 'b&k', 'choice',
]

// ── Per update-type source map ──
export const UPDATE_SOURCES = {
  news: {
    label:      'Stock news & rating changes',
    type:       'rss',
    provider:   'google-news',
    urlPattern: 'https://news.google.com/rss/search?q="{query}" when:30d&hl=en-IN&gl=IN&ceid=IN:en',
    script:     'fetch-news.js',
    output:     'news.json',
    cadence:    'daily',
    status:     'LIVE',
  },
  boardMeetings: {
    label:      'Board meetings / results dates',
    type:       'api',
    provider:   'nse',
    urlPattern: 'https://www.nseindia.com/api/event-calendar?symbol={nseSym}',
    script:     'fetch-nse-calendar.js',
    output:     'ai-insights.json#catalystAlerts',
    cadence:    'weekly',
    status:     'LIVE',
    note:       'NSE API may block datacenter IPs — runs reliably from a residential/India IP.',
  },
  corporateActions: {
    label:      'Dividends / splits / bonuses',
    type:       'api',
    provider:   'nse',
    urlPattern: 'https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol={nseSym}',
    script:     'fetch-nse-actions.js',
    output:     'ai-insights.json#catalystAlerts',
    cadence:    'weekly',
    status:     'LIVE',
    note:       'NSE API may block datacenter IPs.',
  },
  filings: {
    label:      'BSE exchange filings',
    type:       'announcements-api',
    provider:   'bse',
    urlPattern: 'https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?strCat=-1&strPrevDate={from}&strToDate={to}&strScrip={bseCode}&strSearch=P&strType=C',
    output:     'filings.json',
    cadence:    'daily',
    status:     'SEEDED',
    note:       'Data present from an external seed. Dates normalized by fix-filings-dates.js. Native fetcher TBD.',
  },
  results: {
    label:      'Quarterly results financials',
    type:       'derived',
    from:       ['filings', 'news'],
    detect:     'RESULTS_RE',
    output:     'results.json',
    cadence:    'quarterly',
    status:     'PLANNED',
    note:       'Headline financials already surface via news (e.g. "Net Sales ₹1,043cr +28% YoY"). Full P&L from the BSE results filing PDF.',
  },
  concallTranscript: {
    label:      'Earnings concall transcript',
    type:       'filing+ir',
    provider:   'bse | company-ir',
    detect:     'TRANSCRIPT_RE',
    output:     'transcripts.json',
    cadence:    'quarterly (~2 days post-results)',
    status:     'PLANNED',
    note:       'Companies post the transcript PDF within ~2 days. Detect availability from the filings feed by title, then fetch the attachment or the IR-page PDF. Voice→text transcription is a fallback only, not the primary path.',
  },
  ratings: {
    label:      'Brokerage rating changes',
    type:       'derived',
    from:       ['news'],
    detect:     'RATING_RE + BROKERS',
    output:     'news.json#ratingSignals',
    cadence:    'daily',
    status:     'LIVE',
  },
  technicals: {
    label:      'SMA / RSI / 52w range',
    type:       'api',
    provider:   'yahoo-finance | kite',
    script:     'refresh-technicals-yahoo.js',
    output:     'insights.json',
    cadence:    'weekly',
    status:     'LIVE',
  },
  benchmark: {
    label:      'Nifty 50 alpha',
    type:       'api',
    provider:   'yahoo-finance',
    script:     'fetch-benchmark.js',
    output:     'benchmark.json',
    cadence:    'weekly',
    status:     'LIVE',
  },
}

// ── Per-stock identifiers ──
// query  = clean company name for the Google News search
// bseCode = BSE scrip code (for filings / results / transcript fetch)
// ir     = investor-relations page (for concall PDFs), where known
const S = (query, bseCode, nseSym, ir = null) => ({ query, bseCode, nseSym, ir })

export const STOCK_SOURCES = {
  BEL:        S('Bharat Electronics',             '500049', 'BEL'),
  ICICIBANK:  S('ICICI Bank',                     '532174', 'ICICIBANK'),
  PRAJIND:    S('Praj Industries',                '522205', 'PRAJIND'),
  MARUTI:     S('Maruti Suzuki',                  '532500', 'MARUTI'),
  LT:         S('Larsen & Toubro',                '500510', 'LT'),
  MANAPPURAM: S('Manappuram Finance',             '531213', 'MANAPPURAM'),
  KPIL:       S('Kalpataru Projects International','522287', 'KPIL'),
  KEC:        S('KEC International',               '532714', 'KEC'),
  ASIANPAINT: S('Asian Paints',                   '500820', 'ASIANPAINT'),
  SHK:        S('SH Kelkar',                       '539450', 'SHK'),
  MAYURUNIQ:  S('Mayur Uniquoters',               '512599', 'MAYURUNIQ'),
  DABUR:      S('Dabur India',                    '500096', 'DABUR'),
  LTF:        S('L&T Finance',                     '533519', 'LTF'),
  TITAGARH:   S('Titagarh Rail Systems',          '526173', 'TITAGARH'),
  BATAINDIA:  S('Bata India',                     '500043', 'BATAINDIA'),
  BALRAMCHIN: S('Balrampur Chini Mills',          '500038', 'BALRAMCHIN'),
  GOKEX:      S('Gokaldas Exports',               '532630', 'GOKEX'),
  INFY:       S('Infosys',                        '500209', 'INFY'),
  TRENT:      S('Trent',                          '500251', 'TRENT'),
  AHLUCONT:   S('Ahluwalia Contracts',            '532811', 'AHLUCONT'),
  HAL:        S('Hindustan Aeronautics',          '541154', 'HAL'),
  INDHOTEL:   S('Indian Hotels',                  '500850', 'INDHOTEL'),
  IDFCFIRSTB: S('IDFC First Bank',                '539437', 'IDFCFIRSTB'),
  KPIGREEN:   S('KPI Green Energy',               '543651', 'KPIGREEN'),
  KAYNES:     S('Kaynes Technology',              '543300', 'KAYNES'),
  WABAG:      S('VA Tech Wabag',                  '533269', 'WABAG'),
  AMBER:      S('Amber Enterprises',              '540902', 'AMBER'),
  POLYCAB:    S('Polycab India',                  '542652', 'POLYCAB'),
  DIXON:      S('Dixon Technologies',             '541336', 'DIXON'),
  TECHNOE:    S('Techno Electric',                '542141', 'TECHNOE', 'https://www.techno.co.in/investors'),
  'M&MFIN':   S('M&M Financial Services',         '532720', 'M&MFIN'),
  PERSISTENT: S('Persistent Systems',              '533179', 'PERSISTENT', 'https://www.persistent.com/investors/'),
}

// Stocks we ingest single-stock intel for (ETFs / MFs / dupes excluded)
export const INGEST_SYMS = Object.keys(STOCK_SOURCES)

// ── Helpers ──
export const getNewsQuery   = sym => STOCK_SOURCES[sym]?.query ?? sym
export const getBseCode     = sym => STOCK_SOURCES[sym]?.bseCode ?? null
export const getIrPage      = sym => STOCK_SOURCES[sym]?.ir ?? null
export const isResultsFiling    = title => RESULTS_RE.test(title || '')
export const isTranscriptFiling = title => TRANSCRIPT_RE.test(title || '')
export const isOrderFiling      = title => ORDER_RE.test(title || '')
export const isRatingHeadline   = title => RATING_RE.test(title || '')
export const detectBroker = title => {
  const t = (title || '').toLowerCase()
  return BROKERS.find(b => t.includes(b)) ?? null
}
