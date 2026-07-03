import { useState, useMemo } from 'react'
import SectionHeader from './SectionHeader'

const DIMS = [
  { key: 'earningsGrowth',      short: 'EG',   label: 'Earnings Growth' },
  { key: 'balanceSheet',        short: 'BS',   label: 'Balance Sheet' },
  { key: 'mgmtQuality',         short: 'Mgmt', label: 'Management' },
  { key: 'valuationHeadroom',   short: 'Val',  label: 'Valuation' },
  { key: 'orderBookVisibility', short: 'OB',   label: 'Order Book' },
  { key: 'competitiveMoat',     short: 'Moat', label: 'Competitive Moat' },
  { key: 'catalystProximity',   short: 'Cat',  label: 'Catalyst Proximity' },
  { key: 'downsideProtection',  short: 'DP',   label: 'Downside Protection' },
  { key: 'sectorTailwind',      short: 'ST',   label: 'Sector Tailwind' },
  { key: 'governance',          short: 'Gov',  label: 'Governance' },
]

const BUCKETS = ['All', 'Platinum', 'Stars', 'Power Alpha', 'Compounders']

const ACTION_LABEL = { DOUBLE_DOWN: 'DD', HOLD: 'Hold', TRIM: 'Trim', CHURN: 'Churn' }
const ACTION_COLOR = { DOUBLE_DOWN: 'text-green', HOLD: 'text-zinc-500', TRIM: 'text-amber', CHURN: 'text-red' }

function cellCls(v) {
  if (v == null) return 'text-zinc-700'
  if (v >= 8)   return 'bg-green/15 text-green font-bold'
  if (v >= 6)   return 'bg-white/[0.04] text-white/60'
  if (v >= 4)   return 'bg-amber/10 text-amber'
  return 'bg-red/15 text-red font-bold'
}

// canonical conviction scale (see lib/format.convClass): 8+ green · 6+ zinc · 4+ amber · red
function convCls(v) {
  if (v >= 8) return 'text-green'
  if (v >= 6) return 'text-zinc-300'
  if (v >= 4) return 'text-amber'
  return 'text-red'
}

function avgCls(v) {
  if (v == null) return 'text-zinc-600'
  if (v >= 7)   return 'text-green'
  if (v >= 5.5) return 'text-amber'
  return 'text-red'
}

export default function DimensionHeatmap({ rows }) {
  const [bucket, setBucket] = useState('All')

  const filtered = useMemo(() => {
    if (bucket === 'All') return rows
    return rows.filter(r => r.bucket === bucket)
  }, [rows, bucket])

  // Conv avg + per-dim avgs
  const colAvgs = useMemo(() => DIMS.map(d => {
    const vals = filtered.map(r => r.dims?.[d.key]).filter(v => v != null)
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }), [filtered])

  const convAvg = useMemo(() => {
    if (!filtered.length) return null
    return filtered.reduce((s, r) => s + r.conviction, 0) / filtered.length
  }, [filtered])

  if (!filtered.length) return null

  return (
    <section className="space-y-3">
      <SectionHeader title="Dimension Heatmap" subtitle="Every ranked position scored across all 10 conviction dimensions." />

      {/* Bucket filter — single row, horizontal scroll */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {BUCKETS.map(b => (
          <button key={b} onClick={() => setBucket(b)}
            className={`px-2.5 py-1 rounded-full text-meta font-mono whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              bucket === b
                ? 'bg-zinc-700 text-white font-bold'
                : 'bg-white/5 text-zinc-500 hover:text-zinc-300'
            }`}
          >{b}</button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full font-mono text-caption min-w-[580px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/3">
              {/* Sticky sym col */}
              <th className="text-left px-3 py-2 text-zinc-500 font-normal w-[86px] sticky left-0 bg-[#050D18] z-10 border-r border-white/10">
                Stock
              </th>
              {/* Conv second — instant reference */}
              <th className="px-2 py-2 text-zinc-400 font-bold w-[40px] text-center">Conv</th>
              {/* 10 dim columns */}
              {DIMS.map(d => (
                <th key={d.key} className="px-1 py-2 text-zinc-500 font-normal w-[42px] text-center" title={d.label}>
                  {d.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const isOdd = i % 2 === 1
              const stickyBg = isOdd ? 'bg-[#090F1E]' : 'bg-[#050D18]'
              return (
                <tr key={row.sym} className={`border-b border-white/5 ${isOdd ? 'bg-white/[0.015]' : ''}`}>
                  <td className={`px-3 py-1.5 sticky left-0 z-10 border-r border-white/10 ${stickyBg}`}>
                    <span className="text-white font-black text-caption block">{row.sym}</span>
                    <span className={`text-micro ${ACTION_COLOR[row.action]}`}>{ACTION_LABEL[row.action]}</span>
                  </td>
                  <td className={`px-2 py-1.5 text-center font-black text-caption ${convCls(row.conviction)}`}>
                    {row.conviction.toFixed(1)}
                  </td>
                  {DIMS.map(d => {
                    const v = row.dims?.[d.key]
                    return (
                      <td key={d.key} className={`px-1 py-1.5 text-center text-micro ${cellCls(v)}`}>
                        {v ?? '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/20 bg-[#0A1626]">
              <td className={`px-3 py-2 text-zinc-400 text-micro font-black uppercase tracking-wider sticky left-0 bg-[#0A1626] z-10 border-r border-white/10`}>
                Avg
              </td>
              <td className={`px-2 py-2 text-center text-micro font-black ${avgCls(convAvg)}`}>
                {convAvg != null ? convAvg.toFixed(1) : '—'}
              </td>
              {colAvgs.map((avg, i) => (
                <td key={i} className={`px-1 py-2 text-center text-micro font-bold ${avgCls(avg)}`}>
                  {avg != null ? avg.toFixed(1) : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
