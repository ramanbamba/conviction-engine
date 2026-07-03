import { useMemo } from 'react';
import { detectCorporateActions } from '../lib/corporateActionEngine';

/**
 * Hook to integrate corporate actions detection
 */
export function useCorporateActions(catalysts, filings, holdings) {
  return useMemo(() => {
    return detectCorporateActions(catalysts, filings, holdings, 21); // Extended window to 21 days for visibility
  }, [catalysts, filings, holdings]);
}
