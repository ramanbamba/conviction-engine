import { useMemo } from 'react';

export function useRegimeShift(aiInsights, holdings) {
  return useMemo(() => {
    let regime = 'NORMAL';
    
    // Parse macroOverlay for crash conditions
    if (aiInsights?.macroOverlay) {
      const { vix, niftyLevel } = aiInsights.macroOverlay;
      
      // Heuristic 1: VIX > 22
      const vixMatch = vix?.match(/([\d.]+)/);
      if (vixMatch && parseFloat(vixMatch[1]) >= 22) {
        regime = 'CRASH';
      }
      
      // Heuristic 2: Nifty Drop > 5%
      const dropMatch = niftyLevel?.match(/\(-([\d.]+)%\)/);
      if (dropMatch && parseFloat(dropMatch[1]) >= 5.0) {
        regime = 'CRASH';
      }
    }

    let shoppingList = [];
    if (regime === 'CRASH') {
      // 1. High conviction entries (>= 8)
      // 2. Filter out things that don't have a gap (i.e., we are already overweight)
      // 3. Sort by conviction descending, then by gap descending
      shoppingList = holdings
        .filter(h => h.conv >= 8 && h.gap && h.gap > 0 && h.bucket !== 'Cash' && h.bucket !== 'Hedge')
        .sort((a, b) => b.conv - a.conv || b.gap - a.gap)
        .slice(0, 5); // Top 5 candidates
    }

    return { regime, shoppingList };
  }, [aiInsights, holdings]);
}
