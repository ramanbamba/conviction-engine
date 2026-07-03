/**
 * industryPhase.js — NSE "Industry" classification → rotation phase.
 *
 * Judgment-based, same spirit as rotationAlpha.js's THEME_REGIME — refresh each
 * cycle against the live macro read (currently: capex/infra/defence/financials
 * leading; IT + FMCG lagging; crude easing post-Hormuz; rates falling). Used only
 * for the S sleeve of the Stage 1 momentum screen — the real gate is Stage 2's
 * fundamentals + landmine checks, this just biases the shortlist toward leaders.
 */
export const PHASE_SCORE = { markup: 80, accumulation: 65, neutral: 50, distribution: 30 }

export const INDUSTRY_PHASE = {
  'Capital Goods': 'markup',                    // capex supercycle, order books at highs
  'Construction': 'markup',                      // infra/EPC leadership
  'Power': 'markup',                             // grid build-out, renewables + T&D
  'Financial Services': 'accumulation',          // rate-cut cycle, credit clean
  'Automobile and Auto Components': 'accumulation', // demand recovery
  'Realty': 'accumulation',                      // falling rates tailwind
  'Textiles': 'accumulation',                    // China+1 sourcing shift
  'Construction Materials': 'accumulation',       // cement, riding infra capex
  'Metals & Mining': 'neutral',
  'Chemicals': 'neutral',
  'Consumer Durables': 'neutral',
  'Consumer Services': 'neutral',
  'Services': 'neutral',
  'Oil Gas & Consumable Fuels': 'neutral',       // crude easing, mixed
  'Telecommunication': 'neutral',
  'Healthcare': 'neutral',
  'Information Technology': 'distribution',      // AI de-rating fear, weak FY27 guidance
  'Fast Moving Consumer Goods': 'distribution',  // rural soft, valuations full
}

export function phaseScoreFor(industry) {
  const phase = INDUSTRY_PHASE[industry] ?? 'neutral'
  return { phase, score: PHASE_SCORE[phase] }
}
