/**
 * modelAlignment.js — advisor model gap math.
 *
 * Compares each Platinum holding's actual weight against its model target weight
 * (advisorWt, refreshed monthly from Advisor's xlsx) and the rupee gap to align.
 * Surfaces which names are under/over their model weight so the monthly rebalance
 * is one glance, not a spreadsheet.
 *
 * Two lenses:
 *   driftPp   — actual% − model% (the misalignment; >0 overweight, <0 underweight)
 *   gapBuild  — ₹ to reach model weight at the *full bucket target* (deployment plan)
 *   gapRebal  — ₹ to reach model weight at *current* bucket size (sums ~0; pure swap)
 */

/**
 * modelGapVerdict — reconciles Advisor's model signal against our own conviction,
 * fundamental grade and standing overrides into a final call. This is the guard
 * against blindly filling a model gap that our fundamentals say is junk.
 *
 * @param {Object} row   alignment row (needs gapRebal, conv)
 * @param {Object} h     the holding (needs tgtVal for the freeze override)
 * @param {Object} fund  fundamentals.json entry for the symbol (grade/computed/redFlags)
 * @returns {{call:string, tone:'g'|'n'|'b', reason:string}}
 */
export function modelGapVerdict(row, h, fund) {
  const under = row.gapRebal > 5000                  // model says add (₹5k noise floor)
  const over = row.gapRebal < -5000                  // model says trim
  const conv = row.conv ?? h?.conv ?? null
  const frozen = h?.tgtVal === 0
  const mg = fund?.computed?.grade || fund?.grade || null
  const flags = fund?.computed?.redFlags || fund?.redFlags || []
  const govFlag = flags.find(f => /pledge|promoter/i.test(f))
  const weak = mg === 'F' || mg === 'D'
  const g = mg ? ` / grade ${mg}` : ''

  if (over) {
    if (conv >= 7) return { call: 'LET RIDE', tone: 'g', reason: `Overweight vs model, but conv ${conv}${g} — quality. Trim only to fund higher-priority adds.` }
    return { call: 'TRIM SOURCE', tone: 'n', reason: `Overweight vs model, conv ${conv}${g}. Use as the funding source for underweight adds.` }
  }
  if (!under) return { call: 'ON MODEL', tone: 'n', reason: `Within ~₹5k of model weight. No action.` }

  // underweight → Advisor's model says add. Gate it on our own read.
  if (frozen) return { call: 'HOLD — FROZEN', tone: 'b', reason: `Model weight rose, but this position is frozen (tgtVal 0) on structural damage. Do NOT fill the gap.` }
  if (conv != null && conv <= 4) return { call: "DON'T CHASE", tone: 'b', reason: `Underweight, but conv ${conv}${g}. ${mg === 'F' ? 'Advisor himself is trimming the broken name. ' : ''}The gap is acceptable — don't chase the model weight.` }
  if (govFlag) return { call: 'CAUTION', tone: 'b', reason: `Model says add, but ${govFlag.toLowerCase()}. Governance risk overrides — hold, size only with care.` }
  if (weak) return { call: 'SMALL ONLY', tone: 'n', reason: `Underweight; conv ${conv} but machine ${mg}. Token top-up at most, not a full fill.` }
  if (conv != null && conv >= 7) return { call: 'ADD — CLEAN', tone: 'g', reason: `Underweight, conv ${conv}${g}. Model and conviction agree — clean add. Priority for the deploy.` }
  return { call: 'ADD', tone: 'g', reason: `Underweight, conv ${conv ?? '—'}${g}. Reasonable add as you build toward target.` }
}

export function computeModelAlignment(holdings, bucketTargets, fundamentals = null, bucket = 'Platinum') {
  const members = holdings.filter(h => h.bucket === bucket && (h.advisorWt ?? 0) > 0)
  if (!members.length) return null

  const val = h => h.value ?? (h.qty || 0) * (h.ltp || 0)
  const curTotal = members.reduce((a, h) => a + val(h), 0)
  const wSum = members.reduce((a, h) => a + (h.advisorWt || 0), 0) || 1
  const target = bucketTargets?.[bucket]?.target || curTotal

  const rows = members.map(h => {
    const modelWt = (h.advisorWt || 0) / wSum            // normalized to sum to 1
    const actWt = curTotal > 0 ? val(h) / curTotal : 0
    const row = {
      sym: h.sym,
      conv: h.conv ?? null,
      value: val(h),
      modelWt,
      actWt,
      driftPp: (actWt - modelWt) * 100,
      gapBuild: modelWt * target - val(h),
      gapRebal: modelWt * curTotal - val(h),
    }
    row.verdict = modelGapVerdict(row, h, fundamentals?.stocks?.[h.sym])
    return row
  }).sort((a, b) => b.gapRebal - a.gapRebal)

  return {
    bucket,
    rows,
    curTotal,
    target,
    buildGap: target - curTotal,
    maxDrift: Math.max(1, ...rows.map(r => Math.abs(r.driftPp))),
  }
}
