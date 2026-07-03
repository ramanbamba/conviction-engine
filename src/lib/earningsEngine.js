/**
 * P3.1 Earnings Engine
 * Pure functions to detect and track processing of corporate financial results.
 */

import { normalizeFilingDate } from './date';

/**
 * Searches all cached filings for 'earnings' categories that haven't been reviewed yet.
 * @param {Object} filings - The global filings.json payload
 * @param {Object} memory - The current memory.json payload
 * @returns {Array} List of pending interventions
 */
export function detectNewEarnings(filings, memory) {
  if (!filings?.holdings) return [];
  
  const reviewedSet = new Set(
    (memory?.reviewedEarnings || []).map(r => `${r.sym}|${r.date}`)
  );
  
  const pending = [];

  for (const [sym, data] of Object.entries(filings.holdings)) {
    if (!data.filings) continue;

    // Normalize defensively — the external seed occasionally reintroduces
    // mangled dates (DD T time - MM - YYYY) between fix-filings-dates.js runs
    const unreviewedEarnings = data.filings
      .map(f => ({ ...f, _iso: normalizeFilingDate(f.date)?.split('T')[0] ?? f.date }))
      .filter(f => {
        if (f.category !== 'earnings') return false;
        const key = `${sym}|${f._iso}`;
        return !reviewedSet.has(key);
      });

    unreviewedEarnings.forEach(f => {
      pending.push({
        id: `earn-${sym}-${f._iso}`,
        sym,
        date: f._iso,
        title: f.title,
        url: f.url
      });
    });
  }

  // Sort by date ascending, so oldest unreviewed is handled first, or descending for recency
  // We'll use DESCENDING so latest news takes priority
  return pending.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Factory to append verification object to memory cache.
 */
export function addReviewedEarningsEntry(memory, payload) {
  const { sym, date, title, outcome, comments } = payload;
  
  const entry = {
    id: `review-${sym}-${Date.now()}`,
    sym,
    date, // date of the filing
    reviewDate: new Date().toISOString().split('T')[0],
    title,
    outcome, // 'INTACT' | 'WEAKENED' | 'BROKEN'
    comments
  };

  return {
    ...memory,
    reviewedEarnings: [...(memory.reviewedEarnings || []), entry]
  };
}
