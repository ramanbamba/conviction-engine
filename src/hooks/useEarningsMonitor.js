import { useMemo } from 'react';
import { detectNewEarnings } from '../lib/earningsEngine';

/**
 * useEarningsMonitor hook
 * Identifies pending corporate action verification requests by comparing
 * live filing feed against acknowledged memory.
 */
export function useEarningsMonitor(filingsData, memoryData) {
  const pendingReviews = useMemo(() => {
    if (!filingsData || !memoryData) return [];
    return detectNewEarnings(filingsData, memoryData);
  }, [filingsData, memoryData]);

  return {
    pendingReviews,
    hasPending: pendingReviews.length > 0,
    reviewCount: pendingReviews.length
  };
}
