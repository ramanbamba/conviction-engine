// P3.3 Corporate Action Engine
// Pure functions to detect and compute implications of corporate actions

/**
 * Normalises date string to JS Date object
 */
function parseEventDate(dateStr) {
  if (!dateStr) return null;
  // "May 29" -> assume current year 2026
  const currentYear = 2026;
  const parsed = new Date(`${dateStr} ${currentYear}`);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Detects upcoming corporate actions from catalysts and filings.
 * Only returns actions that are within `daysWindow` of today.
 */
export function detectCorporateActions(catalysts, filings, holdings, daysWindow = 14) {
  const actions = [];
  const today = new Date();
  
  // 1. Scan catalysts for structured actions
  if (catalysts) {
    for (const cat of catalysts) {
      const eventLower = cat.event.toLowerCase();
      const isCorpAction = eventLower.includes('bonus') || eventLower.includes('split') || eventLower.includes('rights');
      if (!isCorpAction) continue;

      const eventDate = parseEventDate(cat.date);
      if (!eventDate) continue;

      const daysAway = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      if (daysAway >= 0 && daysAway <= daysWindow) {
        
        // Try to parse ratio, e.g. "(1:2)"
        let ratio = null;
        let type = 'unknown';
        const match = cat.event.match(/\((\d+):(\d+)\)/);
        if (match) {
          const [_, xStr, yStr] = match;
          const x = parseInt(xStr, 10);
          const y = parseInt(yStr, 10);
          
          if (eventLower.includes('bonus')) {
            type = 'bonus';
            // X bonus for Y held -> multiplier = 1 + (x/y)
            ratio = { x, y, multiplier: 1 + (x / y) };
          } else if (eventLower.includes('split')) {
            type = 'split';
            // 1 split to 5 -> multiplier = 5 / 1
            ratio = { x, y, multiplier: y / x };
          }
        }

        cat.stocks.forEach(sym => {
          const holding = holdings.find(h => h.sym === sym);
          if (holding) {
            let adjustedAvg = null;
            let adjustedQty = null;
            if (ratio) {
              adjustedAvg = holding.avg / ratio.multiplier;
              adjustedQty = Math.floor(holding.qty * ratio.multiplier);
            }

            actions.push({
              sym,
              name: holding.name,
              type,
              event: cat.event,
              date: cat.date,
              daysAway,
              ratio,
              currentAvg: holding.avg,
              currentQty: holding.qty,
              adjustedAvg,
              adjustedQty,
              note: cat.note || null
            });
          }
        });
      }
    }
  }

  // Note: filings.json could be scanned here for unstructured detection as a fallback,
  // but extracting exact ratios/dates from raw strings is brittle without LLM.
  // We rely on catalysts for high-conviction structured corporate actions.

  return actions.sort((a, b) => a.daysAway - b.daysAway);
}
