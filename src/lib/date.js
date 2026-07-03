/**
 * date.js — single source of truth for all date operations.
 * Avoids duplicating toISOString().split('T')[0] across 8+ files.
 */

const MONTH_MAP = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
}

/** Returns today as YYYY-MM-DD (UTC, DST-safe) */
export const today = () => new Date().toISOString().split('T')[0]

/** Parse NSE "DD-Mon-YYYY" → "YYYY-MM-DD". Returns null on bad input. */
export function parseNseDate(dateStr) {
  if (!dateStr || dateStr === '-') return null
  const [dd, mon, yyyy] = dateStr.split('-')
  const mm = MONTH_MAP[mon]
  if (!mm || !dd || !yyyy) return null
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

/**
 * Normalize a BSE filing date to a `new Date()`-parseable string.
 * The upstream ingest feed scrambles timestamps to "DDTHH:mm:ss.SSS-MM-YYYY"
 * (e.g. "29T15:24:51.577-05-2026"), which breaks Date parsing and sorting.
 * Returns clean ISO ("2026-05-29T15:24:51.577" or "2026-05-29"); passes valid
 * ISO through untouched; returns null when unparseable so callers can skip it.
 */
export function normalizeFilingDate(str) {
  if (!str || typeof str !== 'string') return null
  // Mangled: DD T time - MM - YYYY
  const m = str.match(/^(\d{1,2})T([\d:.]+)-(\d{2})-(\d{4})$/)
  if (m) return `${m[4]}-${m[3]}-${m[1].padStart(2, '0')}T${m[2]}`
  // Already ISO-ish: 2026-05-29 or 2026-05-29T20:05:45
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]([\d:.]+))?/)
  if (iso) return iso[4] ? `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}` : `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

/** Days between two YYYY-MM-DD strings (positive = future) */
export function daysBetween(from, to) {
  return Math.ceil((new Date(to) - new Date(from)) / 86400000)
}

/** Format ISO timestamp as "May 14, 2026" */
export function formatDate(isoStr) {
  if (!isoStr) return null
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
