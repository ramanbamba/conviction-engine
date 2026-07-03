import { useMemo } from 'react'
import { fL, fP } from '../lib/format'

// ─── Investment pattern library ───────────────────────────────────────────────
// Not every stock follows the WABAG template. Each candidate is ranked on its
// own pattern logic. Pillars are universal: Earn · Qual · Wind · Price · Cat.
// Scores are qualitative judgment; price / gap / RSI data is live from portfolio.
//
// Action status:
//   ADD      → buy now at stated levels
//   TRIGGER  → specific condition must be met first (price level, result)
//   GATED    → structural gate (pledge, Q1 result, external event)
// ──────────────────────────────────────────────────────────────────────────────

const CANDIDATES = [
  {
    sym: 'AHLUCONT',
    rank: 1,
    pattern: 'OB Lock-In · Under-owned',
    pillars: [10, 9, 8, 8, 7],
    action: 'ADD',
    actionCls: 'text-green bg-green/10 border-green/30',
    cardBorder: 'border-teal/30',
    addLevel: '₹800–840 on dips',
    thesis: 'OB ₹18,680cr = 4.5× revenue — sector best. 9M PAT +55.6%. Net cash. Govt institutional construction (hospitals, airports, universities). Nobody covers this stock — that is the alpha.',
    gate: null,
  },
  {
    sym: 'HAL',
    rank: 2,
    pattern: 'Defence Supercycle · MoD OB 7.7×',
    pillars: [10, 8, 9, 8, 8],
    action: 'ADD',
    actionCls: 'text-green bg-green/10 border-green/30',
    cardBorder: 'border-orange/25',
    addLevel: 'Near cost — add dips ₹4,200–4,400',
    thesis: 'MoD order book 7.7× revenue = ~8 years of revenue already contracted. Tejas Mk2, GE-414 engine deal, export momentum. PAT +5.5% understates the story — heavy R&D cycling through. Defence capex ₹6L cr over 5 years.',
    gate: null,
  },
  {
    sym: 'TECHNOE',
    rank: 3,
    pattern: 'Contrarian · Tape Broken, Business Intact',
    pillars: [9, 8, 9, 9, 6],
    action: 'TRIGGER',
    actionCls: 'text-amber bg-amber/10 border-amber/30',
    cardBorder: 'border-purple/20',
    addLevel: '₹1,050–1,100 after stabilisation',
    thesis: 'Built 50%+ of India\'s 400kV+ substations. OB 3.8× revenue. DC revenue ₹125cr FY27 not in consensus guide = pure optionality. PAT +45%. ₹2,800cr cash. RSI 17 = extreme oversold on guidance disappointment, not delivery failure.',
    gate: 'Add only on stabilisation above ₹1,050 — do not chase the bounce from extreme oversold',
  },
  {
    sym: 'BALRAMCHIN',
    rank: 4,
    pattern: 'Sectoral Transition · Ethanol Mandate + PLA Wildcard',
    pillars: [7, 6, 8, 9, 8],
    action: 'ADD',
    actionCls: 'text-green bg-green/10 border-green/30',
    cardBorder: 'border-amber/20',
    addLevel: '₹50K tranches — near cost, build to ₹2.5L',
    thesis: 'Market prices this as sugar (12×). Reality: ethanol mandate = 35% of revenue at regulated govt pricing (zero cyclicality). PLA bioplastics plant FY28 = specialty-chemical re-rating nobody is modelling. Advisor explicit ADD.',
    gate: null,
  },
  {
    sym: 'INDHOTEL',
    rank: 5,
    pattern: 'Cycle Leader · India Hotels 10-yr Upcycle',
    pillars: [8, 8, 9, 8, 7],
    action: 'ADD',
    actionCls: 'text-green bg-green/10 border-green/30',
    cardBorder: 'border-teal/20',
    addLevel: 'Near cost — accumulate ₹700–740',
    thesis: 'India domestic leisure travel in year 2-3 of a 7-10yr RevPAR expansion. Supply lagging demand. IHCL is the brand leader with 37% EBITDA margins. It looks expensive at 49× every year until year 7 — that\'s how cycles work.',
    gate: null,
  },
  {
    sym: 'BEL',
    rank: 6,
    pattern: 'Defence Electronics · Radar + EW + Export Push',
    pillars: [9, 8, 9, 7, 7],
    action: 'ADD',
    actionCls: 'text-green bg-green/10 border-green/30',
    cardBorder: 'border-orange/20',
    addLevel: 'Complete the weight — ₹25K gap remaining',
    thesis: 'Advisor TP upgraded ₹480→₹520 May 22. India\'s highest-tech defence content: radar, EW systems, avionics. OB 3× revenue. Export orders growing — Bangladesh, Vietnam, friendly nations. Margin 28.4% sustained.',
    gate: null,
  },
  {
    sym: 'LTF',
    rank: 7,
    pattern: 'NBFC Transformation · Retail Mix Shift',
    pillars: [8, 7, 8, 8, 7],
    action: 'ADD',
    actionCls: 'text-green bg-green/10 border-green/30',
    cardBorder: 'border-purple/15',
    addLevel: 'Near cost — intentional OW, continue building',
    thesis: 'FY26 PAT ₹3,003cr = highest ever. Disbursements +39%. Transforming from infra NBFC → diversified retail lending. 2.6× book is cheap for the RoE trajectory. This is an intentional overweight — conviction ahead of the advisor model.',
    gate: null,
  },
  {
    sym: 'POLYCAB',
    rank: 8,
    pattern: 'Quality Franchise · Accumulate on Dips',
    pillars: [9, 9, 9, 5, 6],
    action: 'TRIGGER',
    actionCls: 'text-amber bg-amber/10 border-amber/30',
    cardBorder: 'border-teal/15',
    addLevel: 'Add when CMP dips to ₹9,200–9,600',
    thesis: '"Buy and forget. Accumulate on every meaningful dip." PAT +32%, RoCE 34%, market leader in wires and cables. Every infra project, every home, every EV charger = Polycab wire. TP ₹9,600 is stale — bull case ₹12,000+ in FY27.',
    gate: 'Currently above TP ₹9,600 — hold, do not add at CMP. Buy the dip to TP or below.',
  },
  {
    sym: 'KAYNES',
    rank: 9,
    pattern: 'First-Mover Moonshot · India OSAT',
    pillars: [8, 3, 9, 7, 9],
    action: 'GATED',
    actionCls: 'text-red bg-red/10 border-red/30',
    cardBorder: 'border-red/15',
    addLevel: 'Add only post Q1 FY27 confirmation',
    thesis: 'India\'s only listed semiconductor ATMP play — Sanand MCM live. OB ₹9,072cr +50% YoY. TP ₹6,000 = +84%. The anti-WABAG: negative OCF, 4.4× book, Q4 missed guidance 27%. High risk, transformational TAM.',
    gate: 'Q1 FY27 gate: OSAT rev ≥₹80cr + EBITDA margin ≥16% = ADD. Miss on either = reassess. SL ₹3,000 only 8% away — do not average until Q1 confirms.',
  },
  {
    sym: 'KPIGREEN',
    rank: 10,
    pattern: 'Constrained Compounder · Pledge = Re-rate Gate',
    pillars: [8, 4, 9, 9, 7],
    action: 'GATED',
    actionCls: 'text-red bg-red/10 border-red/30',
    cardBorder: 'border-green/15',
    addLevel: 'Watch for pledge reduction — then add aggressively',
    thesis: '16.7× P/E vs peers Inox Wind 38×, Adani Green 50×+. FY26: Rev +55%, PAT +57%. BESS + InvIT + Botswana MOU. India\'s most under-valued renewable compounder. RSI 25 = cheap. The market\'s one question: does the pledge wall ever come down?',
    gate: 'Near ₹8L cap. Do not add until pledge reduction filing confirms promoter is deleveraging. That filing = aggressive add signal.',
  },
]

const PILLAR_LABELS = ['Earn', 'Qual', 'Wind', 'Price', 'Cat']
const PILLAR_TIPS = [
  'Earnings visibility — revenue locked, OB coverage, PAT trajectory',
  'Capital quality — balance sheet, FCF conversion, RoCE/RoE',
  'Structural tailwind — sector upcycle depth, policy support, megatrend duration',
  'Entry price — RSI, vs 52w high, vs avg cost, margin of safety',
  'Catalyst proximity — specific upcoming event that unlocks value',
]

const ACTION_ORDER = { ADD: 0, TRIGGER: 1, GATED: 2 }

function PillarBar({ score, label, tip }) {
  const barCls = score >= 8 ? 'bg-teal' : score >= 6 ? 'bg-zinc-500' : 'bg-red'
  const numCls = score >= 8 ? 'text-teal' : score >= 6 ? 'text-zinc-400' : 'text-red'
  return (
    <div title={tip}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-micro text-zinc-600 font-mono uppercase tracking-wide">{label}</span>
        <span className={`text-micro font-mono font-black ${numCls}`}>{score}</span>
      </div>
      <div className="h-[3px] rounded-full bg-white/8">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${score * 10}%` }} />
      </div>
    </div>
  )
}

export default function DoubleDownPanel({ holdings, aiInsights, insightsData, onSelect }) {
  const enriched = useMemo(() => CANDIDATES.map(c => {
    const h = holdings.find(h => h.sym === c.sym) || {}
    const tech = insightsData?.positions?.[c.sym]?.computedTechnicals || {}
    const value = (h.qty || 0) * (h.ltp || 0)
    const upsidePct = h.tp && h.ltp ? (h.tp - h.ltp) / h.ltp : null
    const deployGap = h.tgtVal != null ? h.tgtVal - value : null
    const deployedPct = h.tgtVal > 0 ? Math.min(100, value / h.tgtVal * 100) : null
    return {
      ...c,
      ltp: h.ltp, tp: h.tp, bucket: h.bucket, conv: h.conv,
      upsidePct, deployGap, deployedPct,
      rsi: tech.rsi14,
      fromHigh: tech.fromHighPct,
      vsSma200: tech.vsSma200Pct,
    }
  }), [holdings, insightsData])

  const wabag = useMemo(() => {
    const h = holdings.find(h => h.sym === 'WABAG') || {}
    return {
      avg: h.avg || 1421,
      ltp: h.ltp,
      tp: h.tp,
      pnlPct: h.avg && h.ltp ? (h.ltp - h.avg) / h.avg : 0.396,
      tpUpside: h.tp && h.ltp ? (h.tp - h.ltp) / h.ltp : 0.11,
    }
  }, [holdings])

  // Group by action for a summary line
  const addNow = enriched.filter(c => c.action === 'ADD').length
  const onTrigger = enriched.filter(c => c.action === 'TRIGGER').length
  const gated = enriched.filter(c => c.action === 'GATED').length

  return (
    <div className="space-y-2">

      {/* Gold standard benchmark */}
      <div className="px-3 py-2.5 rounded-lg bg-teal/5 border border-teal/20 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta font-mono">
          <span className="font-black text-teal">WABAG</span>
          <span className="text-zinc-600 text-micro uppercase tracking-wider">Portfolio gold standard</span>
          <span className="text-zinc-500">avg ₹{Math.round(wabag.avg)}</span>
          <span className="text-zinc-600">→</span>
          {wabag.ltp && <span className="text-zinc-400">CMP ₹{Math.round(wabag.ltp)}</span>}
          <span className={`font-black ${wabag.pnlPct >= 0 ? 'text-green' : 'text-red'}`}>{fP(wabag.pnlPct)}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500">OB 3× rev · net cash · water megatrend · under-owned at entry</span>
          {wabag.tp && <span className="text-zinc-500 ml-auto">{fP(wabag.tpUpside)} to TP ₹{wabag.tp}</span>}
        </div>
        <div className="text-micro text-zinc-600 font-mono">Every new deployment should have a clear reason it belongs here.</div>
      </div>

      {/* Action summary + pillar legend */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-micro font-mono">
          <span className="text-green font-black">{addNow} add now</span>
          <span className="text-zinc-700">·</span>
          <span className="text-amber">{onTrigger} on trigger</span>
          <span className="text-zinc-700">·</span>
          <span className="text-red">{gated} gated</span>
        </div>
        <div className="flex items-center gap-1 text-micro font-mono text-zinc-700">
          {PILLAR_LABELS.map((l, i) => (
            <span key={l} title={PILLAR_TIPS[i]} className="px-1.5 py-0.5 rounded bg-white/3 text-zinc-600">{l}</span>
          ))}
        </div>
      </div>

      {/* Candidate rows */}
      {enriched.map(c => (
        <button
          key={c.sym}
          onClick={() => onSelect?.(c.sym)}
          className={`w-full text-left px-3 py-3 rounded-xl border ${c.cardBorder} bg-white/2 hover:bg-white/4 transition-colors cursor-pointer`}
        >
          {/* Row 1: rank + sym + pattern + action badge | price + upside + gap */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
              <span className="text-zinc-600 font-mono font-black text-micro shrink-0">#{c.rank}</span>
              <span className="font-mono font-black text-white text-body shrink-0">{c.sym}</span>
              <span className={`text-micro font-mono font-black px-1.5 py-0.5 rounded border ${c.actionCls} shrink-0`}>
                {c.action}
              </span>
              <span className="text-micro text-zinc-600 font-mono hidden sm:inline">{c.pattern}</span>
              {c.rsi != null && c.rsi < 30 && (
                <span className="text-micro font-mono text-red bg-red/10 border border-red/20 px-1.5 py-0.5 rounded shrink-0">
                  RSI {c.rsi.toFixed(0)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 font-mono text-meta">
              {c.ltp != null && <span className="text-zinc-400">₹{Math.round(c.ltp)}</span>}
              {c.tp != null && <span className="text-zinc-600">→ ₹{c.tp}</span>}
              {c.upsidePct != null && (
                <span className={`font-black ${c.upsidePct >= 0 ? 'text-green' : 'text-amber'}`}>
                  {fP(c.upsidePct)}
                </span>
              )}
              {c.deployGap != null && c.deployGap > 5000 && (
                <span className="text-amber font-black">{fL(c.deployGap)} gap</span>
              )}
            </div>
          </div>

          {/* Row 2: 5 pillar bars */}
          <div className="grid grid-cols-5 gap-2 mb-2.5">
            {c.pillars.map((score, i) => (
              <PillarBar key={i} score={score} label={PILLAR_LABELS[i]} tip={PILLAR_TIPS[i]} />
            ))}
          </div>

          {/* Row 3: deploy progress */}
          {c.deployedPct != null && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-[2px] rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full ${c.action === 'ADD' ? 'bg-teal' : c.action === 'TRIGGER' ? 'bg-amber' : 'bg-zinc-600'}`}
                  style={{ width: `${c.deployedPct.toFixed(0)}%` }}
                />
              </div>
              <span className="text-micro text-zinc-600 font-mono shrink-0">{c.deployedPct.toFixed(0)}% deployed</span>
            </div>
          )}

          {/* Row 4: thesis */}
          <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
            <span className="text-caption text-zinc-500 leading-snug flex-1 min-w-0">{c.thesis}</span>
            <span className={`text-micro font-black px-2 py-0.5 rounded border font-mono shrink-0 ${c.actionCls}`}>
              {c.addLevel}
            </span>
          </div>

          {/* Row 5: gate / trigger condition */}
          {c.gate && (
            <div className={`mt-0.5 text-micro font-mono leading-snug ${c.action === 'GATED' ? 'text-red/70' : 'text-amber/70'}`}>
              ⚠ {c.gate}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
