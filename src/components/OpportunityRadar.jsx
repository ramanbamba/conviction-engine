import { useState } from 'react'
import { Radar, Info } from 'lucide-react'
import radarData from '../data/opportunity-radar.json'
import { fN } from '../lib/format'

const TIER_META = {
  STRONG:   { cls: 'text-green border-green/30 bg-green/10' },
  POSITIVE: { cls: 'text-teal border-teal/30 bg-teal/10' },
  NEUTRAL:  { cls: 'text-zinc-400 border-white/15 bg-white/5' },
  NEGATIVE: { cls: 'text-red border-red/30 bg-red/10' },
}

const PHASE_CLS = {
  markup: 'text-green', accumulation: 'text-teal', neutral: 'text-zinc-500', distribution: 'text-amber',
}

/**
 * OpportunityRadar — PHASE 19 Sprint D. The AlphaModel run over the Nifty 200
 * universe (minus held names), not just the 35 you own. Two-stage funnel:
 * Stage 1 (momentum + sector, all ~190 names, cheap) narrows to a shortlist;
 * Stage 2 (real fundamentals scrape) grades only the shortlist. Distressed
 * names (negative book value / cumulative losses — a known gap in the shared
 * gates) sink to the bottom regardless of score, flagged, not hidden.
 *
 * Data is precomputed by scripts/run-opportunity-radar.js (npm run
 * universe:refresh) — this component only renders src/data/opportunity-radar.json.
 */
export default function OpportunityRadar() {
  const [openSym, setOpenSym] = useState(null)
  const rows = radarData?.rows || []
  if (!rows.length) {
    return (
      <div className="text-caption text-zinc-600 italic py-3">
        No scan yet — run <span className="font-mono text-zinc-500">npm run universe:refresh</span> to hunt the Nifty 200 for names you don't own.
      </div>
    )
  }

  const clean = rows.filter(r => !r.distressed)
  const distressed = rows.filter(r => r.distressed)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 text-micro font-mono text-zinc-600">
        <span>Scanned {radarData.universeSize} names · shortlisted {radarData.shortlistSize} · graded {radarData.graded}</span>
        <span>as of {radarData.asOf}</span>
      </div>
      <p className="text-caption text-zinc-500 leading-snug">
        The next WABAG isn't in your book yet. This hunts the whole index for it — same AlphaModel (Quality/Momentum/Growth/Valuation/Sector, gated on pledge + earnings quality), run over names you don't own. Not a buy list — a shortlist to interrogate.
      </p>

      <div className="space-y-1.5">
        {clean.map(r => (
          <Row key={r.sym} r={r} open={openSym === r.sym} onToggle={() => setOpenSym(openSym === r.sym ? null : r.sym)} />
        ))}
      </div>

      {distressed.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <div className="text-nano uppercase tracking-wider text-red font-black mb-1.5">
            Flagged — momentum/sector looked good, fundamentals don't hold
          </div>
          <div className="space-y-1.5">
            {distressed.map(r => (
              <Row key={r.sym} r={r} open={openSym === r.sym} onToggle={() => setOpenSym(openSym === r.sym ? null : r.sym)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ r, open, onToggle }) {
  const tier = TIER_META[r.model.tier] || TIER_META.NEUTRAL
  const gate = r.model.gates.gov * r.model.gates.eq
  return (
    <div className={`rounded-lg border ${r.distressed ? 'border-red/20' : 'border-white/5'} bg-white/2 ${open ? 'bg-white/4' : ''}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer">
        <span className={`text-nano font-black uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono shrink-0 ${tier.cls}`}>{r.model.tier}</span>
        <span className="font-mono font-black text-white text-caption shrink-0">{r.sym}</span>
        <span className="text-micro text-zinc-600 font-mono truncate hidden sm:inline">{r.industry}</span>
        <span className="ml-auto flex items-center gap-3 font-mono text-micro shrink-0">
          {r.distressed && <span className="text-red">⚠ {r.distressFlags[0]}</span>}
          <span className="text-zinc-500">₹{fN(Math.round(r.ltp))}</span>
          <span className={PHASE_CLS[r.sectorPhase] || 'text-zinc-500'}>{r.sectorPhase}</span>
          <span className="font-black text-white">{r.model.score}</span>
          <Info className="w-3.5 h-3.5 text-zinc-600" />
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0.5 space-y-2 text-micro font-mono">
          <div className="text-zinc-500">{r.name}</div>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(r.model.sleeves).map(([k, v]) => (
              <div key={k}>
                <div className="text-nano text-zinc-600 uppercase">{k}</div>
                <div className="text-zinc-300 font-bold">{v ?? '—'}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-zinc-500">
            <span>Grade <span className="text-zinc-300 font-bold">{r.grade ?? '—'}</span></span>
            <span>Gate <span className={gate < 0.95 ? 'text-amber font-bold' : 'text-zinc-300 font-bold'}>×{gate.toFixed(2)}</span></span>
            <span>P/E <span className="text-zinc-300">{r.pe ?? '—'}</span></span>
            <span>ROCE/ROE <span className="text-zinc-300">{r.roce ?? r.roe ?? '—'}</span></span>
            <span>Pledge <span className="text-zinc-300">{r.pledge}%</span></span>
            <span>Driver <span className="text-zinc-300">{r.model.driver}</span></span>
          </div>
          {r.redFlags?.length > 0 && (
            <div className="text-amber">⚑ {r.redFlags.join(' · ')}</div>
          )}
          {r.distressed && (
            <div className="text-red">⚠ Structural distress: {r.distressFlags.join('; ')} — treat this score as unreliable, not investable as-is.</div>
          )}
        </div>
      )}
    </div>
  )
}
