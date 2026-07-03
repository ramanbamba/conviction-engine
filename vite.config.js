import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// ─── Local API plugin ───────────────────────────────────────────────────────
function localApiPlugin() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {

        if (req.url === '/api/memory' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const filePath = path.resolve(__dirname, 'src/data/memory.json');
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });

        } else if (req.url === '/api/portfolio' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const filePath = path.resolve(__dirname, 'src/data/portfolio.json');
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });

        // Append a conviction drift entry without requiring full memory state from caller
        } else if (req.url === '/api/conviction' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { sym, from, to, reason, date, priceAtChange } = JSON.parse(body);
              const filePath = path.resolve(__dirname, 'src/data/memory.json');
              const memory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              const entry = {
                id: `conv-${sym}-${Date.now()}`,
                sym, from, to,
                direction: to > from ? 'up' : 'down',
                reason: reason || null,
                date,
                priceAtChange: priceAtChange ?? null
              };
              memory.convictionLog = [...(memory.convictionLog || []), entry];
              fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, entry }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });

        // Record a completed earnings review
        } else if (req.url === '/api/earnings/review' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { sym, date, title, outcome, comments } = JSON.parse(body);
              const filePath = path.resolve(__dirname, 'src/data/memory.json');
              const memory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              const entry = {
                id: `review-${sym}-${Date.now()}`,
                sym, date, title, outcome, comments,
                reviewDate: new Date().toISOString().split('T')[0]
              };
              memory.reviewedEarnings = [...(memory.reviewedEarnings || []), entry];
              fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, entry }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });

        // ── Kite live sync ──────────────────────────────────────────────────
        } else if (req.url === '/api/kite-sync' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json')
            try {
              const { accessToken } = JSON.parse(body || '{}')
              const apiKey = process.env.KITE_API_KEY || ''
              const token  = accessToken || process.env.KITE_ACCESS_TOKEN || ''

              if (!token) {
                res.statusCode = 400
                return res.end(JSON.stringify({ needsToken: true, error: 'Provide a Kite access token' }))
              }

              const authHeader = `token ${apiKey}:${token}`
              const kiteHeaders = { 'Authorization': authHeader, 'X-Kite-Version': '3' }

              const [hRes, pRes] = await Promise.all([
                fetch('https://api.kite.trade/portfolio/holdings',  { headers: kiteHeaders }),
                fetch('https://api.kite.trade/portfolio/positions', { headers: kiteHeaders }),
              ])

              if (hRes.status === 403 || hRes.status === 401) {
                res.statusCode = 401
                return res.end(JSON.stringify({ needsToken: true, error: 'Invalid or expired access token' }))
              }
              if (!hRes.ok) {
                const text = await hRes.text()
                res.statusCode = hRes.status
                return res.end(JSON.stringify({ error: `Kite holdings: ${text.slice(0, 200)}` }))
              }

              const { data: holdings }           = await hRes.json()
              const { data: { net: positions } } = await pRes.json()

              // Write raw feeds (what the sync engine consumes)
              const feedDir = path.resolve(__dirname, 'data/kite')
              fs.writeFileSync(path.join(feedDir, 'holdings.json'),  JSON.stringify(holdings,  null, 2))
              fs.writeFileSync(path.join(feedDir, 'positions.json'), JSON.stringify(positions, null, 2))

              // Run sync engine
              const { runRefresh } = await import('./lib/sync/engine.js')
              const out = runRefresh({
                portfolioPath: path.resolve(__dirname, 'src/data/portfolio.json'),
                holdingsPath:  path.join(feedDir, 'holdings.json'),
                positionsPath: path.join(feedDir, 'positions.json'),
                snapshotsDir:  path.resolve(__dirname, 'data/snapshots'),
                actor: 'sync-button',
              })

              // Rebuild backtest history so alpha bar stays current
              try {
                const { buildHistory } = await import('./scripts/build-history.js')
                buildHistory()
              } catch (_) { /* non-fatal */ }

              res.statusCode = 200
              res.end(JSON.stringify({
                success:   true,
                changed:   out.totals.changedHoldings,
                unchanged: out.totals.unchangedHoldings,
                skipped:   out.totals.skippedFromFeed,
                timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) + ' IST',
              }))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
            }
          })

        // Manual trigger to refresh BSE filings cache
        } else if (req.url === '/api/filings/refresh' && req.method === 'POST') {
          fetchAndCacheFilings(__dirname).then(() => {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
          }).catch(err => {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          });

        } else {
          next();
        }
      });
    }
  };
}

// ─── BSE Filings plugin ─────────────────────────────────────────────────────
const FILINGS_TTL_MS = 4 * 60 * 60 * 1000; // refresh every 4 hours
const BSE_HEADERS = {
  'User-Agent':  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept':      'application/json, text/plain, */*',
  'Referer':     'https://www.bseindia.com/',
  'Origin':      'https://www.bseindia.com'
};

const CATEGORY_MAP = {
  'financial result': 'earnings',
  'board meeting':    'board',
  'agm':              'agm',
  'egm':              'agm',
  'dividend':         'corporate_action',
  'bonus':            'corporate_action',
  'split':            'corporate_action',
  'rights':           'corporate_action',
  'buy back':         'corporate_action',
  'insider':          'insider',
  'shareholding':     'shareholding',
  'credit rating':    'rating',
  'analyst':          'management',
  'investor meet':    'management'
};

const IMPORTANCE = {
  earnings: 'high', board: 'high', insider: 'high', rating: 'high',
  agm: 'medium', corporate_action: 'medium', shareholding: 'medium',
  management: 'low', general: 'low'
};

function categorise(raw = '') {
  const lower = raw.toLowerCase();
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return cat;
  }
  return 'general';
}

function formatBseDate(d) {
  // BSE date: "16-05-2026 10:00:00" → "2026-05-16"
  if (!d) return null;
  const [datePart] = d.split(' ');
  const [dd, mm, yyyy] = datePart.split('-');
  return `${yyyy}-${mm}-${dd}`;
}

function bseDateParam(date) {
  // BSE API wants YYYYMMDD
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

async function fetchScripFilings(bseCode, fromDate, toDate) {
  const params = new URLSearchParams({
    pageno:      '1',
    strCat:      '-1',
    strPrevDate: bseDateParam(fromDate),
    strScrip:    bseCode,
    strSearch:   'P',
    strToDate:   bseDateParam(toDate),
    strType:     'C',
    subcategory: '-1'
  });

  const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?${params}`;
  const res = await fetch(url, { headers: BSE_HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BSE API ${res.status} for ${bseCode}`);

  const json = await res.json();
  const rows = json?.Table || [];

  return rows.map(row => {
    const category = categorise(row.CATEGORYNAME || '');
    return {
      date:        formatBseDate(row.DT_TM),
      title:       row.HEADLINE || row.SUBCATNAME || '',
      category,
      importance:  IMPORTANCE[category] || 'low',
      bseCategory: row.CATEGORYNAME || '',
      url:         row.NSURL || null
    };
  }).filter(f => f.date);
}

async function fetchAndCacheFilings(rootDir) {
  const scripMapPath  = path.resolve(rootDir, 'src/data/scrip_map.json');
  const filingsPath   = path.resolve(rootDir, 'src/data/filings.json');

  const scripMap = JSON.parse(fs.readFileSync(scripMapPath, 'utf-8'));
  const toDate   = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 90); // last 90 days

  const result = { fetchedAt: toDate.toISOString(), holdings: {} };
  const syms   = Object.entries(scripMap).filter(([, v]) => v?.bseCode);

  console.log(`[filings] Fetching BSE announcements for ${syms.length} holdings...`);

  for (const [sym, meta] of syms) {
    try {
      const filings = await fetchScripFilings(meta.bseCode, fromDate, toDate);
      result.holdings[sym] = { bseCode: meta.bseCode, filings };
      // Rate-limit: 300ms between calls to avoid BSE throttle
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.warn(`[filings] Skipped ${sym} (${meta.bseCode}): ${err.message}`);
      result.holdings[sym] = { bseCode: meta.bseCode, filings: [] };
    }
  }

  fs.writeFileSync(filingsPath, JSON.stringify(result, null, 2));
  const total = Object.values(result.holdings).reduce((s, h) => s + h.filings.length, 0);
  console.log(`[filings] Cached ${total} filings across ${syms.length} holdings.`);
}

function bseFilingsPlugin() {
  return {
    name: 'bse-filings',
    async buildStart() {
      const filingsPath = path.resolve(__dirname, 'src/data/filings.json');
      try {
        const existing = JSON.parse(fs.readFileSync(filingsPath, 'utf-8'));
        if (existing.fetchedAt) {
          const age = Date.now() - new Date(existing.fetchedAt).getTime();
          if (age < FILINGS_TTL_MS) {
            console.log(`[filings] Cache fresh (${Math.round(age / 60000)}m old), skipping fetch.`);
            return;
          }
        }
      } catch (_) { /* cache missing or corrupt, fetch fresh */ }

      await fetchAndCacheFilings(__dirname);
    }
  };
}

// ─── Vite config ─────────────────────────────────────────────────────────────
export default defineConfig({
  plugins: [react(), localApiPlugin(), bseFilingsPlugin()],
  server: {
    port: 5173,
    open: true,
  },
})
