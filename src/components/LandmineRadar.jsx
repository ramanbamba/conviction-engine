import { useMemo } from 'react'
import { Radar } from 'lucide-react'
import fundamentalsData from '../data/fundamentals.json'
import insightsData from '../data/insights.json'
import aiInsightsData from '../data/ai-insights.json'
import { alphaModel } from '../lib/alphaModel'
import { scanLandmines, SEVERITY_META } from '../lib/landmineRadar'
import { fL } from '../lib/format'

const FLAG_LABEL = {
  PLEDGE: 'PLEDGE', EARNINGS: 'EARNINGS', DERATING: 'DE-RATING', STOP: 'STOP', DRAWDOWN: 'DRAWDOWN',
}

function Row({ r, onSelect }) {
  const sev = SEVERITY_META[r.severity]
  const Tag = onSelect ? 'button' : 'div'
  return (
    <Tag onClick={onSelect ? () => onSelect(r.sym) : undefined}
      className={`w-full text-left flex items-start gap-3 py-2 rounded transition-colors group ${onSelect ? 'hover:bg-white/2 cursor-pointer' : ''}`}>
      <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: sev.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-black text-white text-caption">{r.sym}</span>
          <span className="font-mono text-micro text-zinc-500">{r.weight.toFixed(1)}% · {fL(r.value)}</span>
          {r.pnlPct < 0 && <span className="font-mono text-micro text-red">{(r.pnlPct * 100).toFixed(0)}%</span>}
          <span className="flex items-center gap-1 ml-auto">
            {r.flags.map(f => (
              <span key={f.type} className={`text-nano font-mono font-black px-1 py-0.5 rounded ${f.structural ? 'text-red bg-red/10' : 'text-zinc-500 bg-white/5'}`}>{FLAG_LABEL[f.type] || f.type}</span>
            ))}
          </span>
        </div>
        <p className="text-micro text-zinc-500 font-mono leading-snug mt-0.5 group-hover:text-zinc-400 transition-colors">{r.headline}</p>
      </div>
    </Tag>
  )
}

/**
 * LandmineRadar — cut fast. Scans the held book for the India-specific
 * structural destroyers (pledge, earnings quality, de-rating) and is loudest
 * exactly when a thesis is breaking. PHASE_19 Sprint C.
 */
// Shared compute so a parent can derive a badge once and pass it down.
export function computeLandmineScan(holdings = []) {
  const aMap = {}
  for (const h of holdings) {
    aMap[h.sym] = alphaModel({
      fundamentals: fundamentalsData?.stocks?.[h.sym],
      technicals: insightsData?.positions?.[h.sym]?.computedTechnicals,
      ltp: h.ltp, theme: h.theme,
      auditSeverity: aiInsightsData?.earningsAudit?.stocks?.[h.sym]?.severity,
      sectorRotation: aiInsightsData?.sectorRotation,
    })
  }
  return scanLandmines(holdings, aMap, aiInsightsData?.earningsAudit?.stocks || {}, insightsData)
}

export default function LandmineRadar({ holdings = [], scan: scanProp, onSelect }) {
  const scanLocal = useMemo(() => scanProp || computeLandmineScan(holdings), [scanProp, holdings])
  const scan = scanLocal

  if (!scan.rows.length) {
    return (
      <section className="rounded-xl border border-green/15 bg-green/5 p-4">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-green" />
          <span className="text-meta uppercase tracking-wider text-zinc-300 font-black">Landmine Radar</span>
          <span className="text-caption text-green ml-2">Clear — no structural destroyers in the book.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/2 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-red" />
          <div>
            <div className="text-meta uppercase tracking-wider text-zinc-400 font-black">Landmine Radar</div>
            <div className="text-nano text-zinc-600">structural destroyers — pledge · earnings · de-rating · cut fast</div>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-caption">
          <div className="text-right">
            <div className="text-nano text-zinc-600 uppercase">Critical</div>
            <div className={`font-black ${scan.criticalCount ? 'text-red' : 'text-green'}`}>{scan.criticalCount}</div>
          </div>
          <div className="text-right">
            <div className="text-nano text-zinc-600 uppercase">At risk</div>
            <div className="font-black text-zinc-200">{fL(scan.atRiskValue)}</div>
          </div>
        </div>
      </div>

      <p className="text-caption text-zinc-400 leading-snug">
        Your tape: a few fat-tail losers (NCC, DLF) erased years of gains — top-5 losers did −₹8.06L, 40% of all losses. A structural break at size is the one thing to act on without debate. Cut before it compounds.
      </p>

      {scan.critical.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-nano uppercase tracking-wider text-red font-black mb-1">Critical · structural break at size</div>
          {scan.critical.map(r => <Row key={r.sym} r={r} onSelect={onSelect} />)}
        </div>
      )}

      {scan.warning.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <div className="text-nano uppercase tracking-wider text-amber font-black mb-1">Warning · fragile but contained</div>
          <div className="flex flex-wrap gap-1.5">
            {scan.warning.map(r => {
              const Tag = onSelect ? 'button' : 'span'
              return (
                <Tag key={r.sym} onClick={onSelect ? () => onSelect(r.sym) : undefined}
                  className={`text-micro font-mono px-2 py-0.5 rounded border border-amber/20 bg-amber/5 text-zinc-300 transition-colors ${onSelect ? 'hover:bg-amber/10 cursor-pointer' : ''}`}
                  title={r.headline}>
                  {r.sym} <span className="text-zinc-500">{r.weight.toFixed(1)}%</span>
                </Tag>
              )
            })}
          </div>
        </div>
      )}

      {scan.watch.length > 0 && (
        <div className="pt-2 border-t border-white/5 text-micro font-mono text-zinc-600">
          Watch (price-only, no structural cause): {scan.watch.map(r => r.sym).join(' · ')}
        </div>
      )}
    </section>
  )
}
