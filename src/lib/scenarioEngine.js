/**
 * scenarioEngine.js
 * Stress-test scenarios using bucket-level betas (v1 — stock-level betas later).
 */

// Bucket-level market betas (β to Nifty)
const BUCKET_BETAS = {
  Platinum:    0.9,
  Stars:       1.3,
  'Power Alpha': 1.5,
  Compounders: 0.8,
  Satellites:  0.7,
  Hedge:      -0.3,  // inverse / defensive
  Cash:        0.0,
}

// Sector sensitivities for non-market scenarios
const CRUDE_IMPACT = {
  positive: ['GOLDBEES', 'SILVERBEES', 'METALIETF', 'MOMOMENTUM'],
  negative: ['MARUTI', 'MARUTI-PA', 'DABUR', 'JYOTHYLAB', 'BATAINDIA'],
}

const RATE_CUT_IMPACT = {
  positive: ['IDFCFIRSTB', 'MANAPPURAM', 'LTF', 'M&MFIN'],
  negative: ['GOLDBEES', 'SILVERBEES'],
}

const SCENARIOS = {
  NIFTY_MINUS_10: {
    label:       'Nifty -10%',
    description: 'Market correction — all holdings repriced by bucket beta × -10%',
  },
  CRUDE_95: {
    label:       'Crude $95+',
    description: 'Oil spike — auto/FMCG impacted negatively, commodities positive',
  },
  RATE_CUT_50BPS: {
    label:       'Rate cut 50bps',
    description: 'RBI rate cut — NBFCs/banks rally, fixed income hedges weaken',
  },
}

/**
 * @param {Array}  holdings - enriched holdings from usePortfolio
 * @param {string} scenario - 'NIFTY_MINUS_10' | 'CRUDE_95' | 'RATE_CUT_50BPS'
 * @returns {{ scenarioLabel, description, estimatedImpact, estimatedImpactPct, impactedStocks[] }}
 */
export function runScenario(holdings = [], scenario) {
  const def = SCENARIOS[scenario]
  if (!def || !holdings.length) return null

  const impactedStocks = []
  let totalImpact = 0

  holdings.forEach(h => {
    if (!h.value) return

    let estimatedChange = 0
    let direction = 'neutral'
    let reason = ''

    if (scenario === 'NIFTY_MINUS_10') {
      const beta = BUCKET_BETAS[h.bucket] ?? 1.0
      estimatedChange = h.value * beta * -0.10
      direction = estimatedChange < 0 ? 'negative' : estimatedChange > 0 ? 'positive' : 'neutral'
      reason = `β=${beta} (${h.bucket})`

    } else if (scenario === 'CRUDE_95') {
      if (CRUDE_IMPACT.negative.includes(h.sym)) {
        estimatedChange = h.value * -0.06
        direction = 'negative'
        reason = 'Crude cost-push headwind'
      } else if (CRUDE_IMPACT.positive.includes(h.sym)) {
        estimatedChange = h.value * 0.04
        direction = 'positive'
        reason = 'Commodity / hedge tailwind'
      } else {
        direction = 'neutral'
        reason = 'Neutral to crude move'
      }

    } else if (scenario === 'RATE_CUT_50BPS') {
      if (RATE_CUT_IMPACT.positive.includes(h.sym)) {
        estimatedChange = h.value * 0.05
        direction = 'positive'
        reason = 'NBFC / rate-sensitive tailwind'
      } else if (RATE_CUT_IMPACT.negative.includes(h.sym)) {
        estimatedChange = h.value * -0.03
        direction = 'negative'
        reason = 'Fixed income hedge weakens'
      } else {
        direction = 'neutral'
        reason = 'Neutral to rate cut'
      }
    }

    totalImpact += estimatedChange

    if (direction !== 'neutral' || scenario === 'NIFTY_MINUS_10') {
      impactedStocks.push({
        sym: h.sym,
        bucket: h.bucket,
        estimatedChange,
        direction,
        reason,
      })
    }
  })

  const totalValue = holdings.reduce((s, h) => s + (h.value || 0), 0)

  return {
    scenarioLabel:      def.label,
    description:        def.description,
    estimatedImpact:    totalImpact,
    estimatedImpactPct: totalValue > 0 ? totalImpact / totalValue : 0,
    impactedStocks:     impactedStocks.sort((a, b) => Math.abs(b.estimatedChange) - Math.abs(a.estimatedChange)),
  }
}

export { SCENARIOS }
