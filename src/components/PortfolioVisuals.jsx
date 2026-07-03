import { useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  BarChart, Bar, ReferenceLine, LabelList,
} from 'recharts'
import { fL, fP, BUCKET_ORDER, BUCKET_COLORS, convColor } from '../lib/format'
import { AlertTriangle, TrendingDown, TrendingUp, Target, Crosshair, Shield, Zap, BarChart2, Activity, Map } from 'lucide-react'
import ConvictionMap from './ConvictionMap'
import CalibrationScorecard from './CalibrationScorecard'
import SectionCard from './SectionCard'

const RADIAN = Math.PI / 180

function KpiCard({ label, value, sub, icon: Icon, color = 'var(--text-pri)', pulse }) {
  return (
    <div className={`bg-card/50 backdrop-blur-md border border-border-dim rounded-xl p-4 flex flex-col gap-1 transition-all hover:border-border hover:bg-card/70 ${pulse ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />}
        <span className="text-meta uppercase tracking-[0.12em] font-bold text-text-dim">{label}</span>
      </div>
      <span className="font-mono text-heading md:text-hero font-black tracking-tight leading-none" style={{ color }}>{value}</span>
      {sub && <span className="text-meta font-mono text-text-dim">{sub}</span>}
    </div>
  )
}

function BucketDonut({ buckets, totalVal, bucketTargets, onBucketClick }) {
  const data = useMemo(() =>
    BUCKET_ORDER.map(name => {
      const val = buckets[name] || 0
      const target = bucketTargets[name]?.target || 0
      return { name, value: val, target, color: BUCKET_COLORS[name], pct: totalVal > 0 ? (val / totalVal * 100) : 0 }
    }).filter(d => d.value > 0),
    [buckets, totalVal, bucketTargets]
  )

  const targetData = useMemo(() =>
    BUCKET_ORDER.map(name => ({
      name, value: bucketTargets[name]?.target || 0, color: BUCKET_COLORS[name] + '40'
    })).filter(d => d.value > 0),
    [bucketTargets]
  )

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, pct }) => {
    if (pct < 4) return null
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fontFamily="IBM Plex Mono">
        {pct.toFixed(0)}%
      </text>
    )
  }

  return (
    <div className="bg-card/50 backdrop-blur-md border border-border-dim rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-3.5 h-3.5 text-text-dim" />
        <span className="text-meta uppercase tracking-[0.12em] font-bold text-text-dim">Bucket Allocation vs Target</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center">
        <div className="w-[200px] h-[200px] shrink-0 mx-auto sm:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={targetData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={60} strokeWidth={0}>
                {targetData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={65} outerRadius={92}
                strokeWidth={1} stroke="#050D1E" cursor="pointer"
                onClick={(_, idx) => onBucketClick?.(data[idx]?.name)}
                label={renderLabel} labelLine={false}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0D1E35', border: '1px solid #1A3050', borderRadius: 8, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                itemStyle={{ color: '#E0EEFF' }}
                formatter={(val, name) => [fL(val), name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full mt-3 sm:mt-0 sm:ml-3 sm:flex-1 space-y-1.5">
          {data.map(d => {
            const gap = d.target - d.value
            const gapPct = d.target > 0 ? (gap / d.target * 100) : 0
            return (
              <button key={d.name} onClick={() => onBucketClick?.(d.name)}
                className="w-full flex items-center gap-2 text-left hover:bg-white/5 rounded px-1.5 py-1 transition-colors group">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-meta font-semibold text-text-sec group-hover:text-white flex-1 truncate">{d.name}</span>
                <span className="text-meta font-mono font-bold text-text-pri">{fL(d.value)}</span>
                {d.target > 0 && gap > 0 && (
                  <span className={`text-meta font-mono ${gapPct > 50 ? 'text-red' : gapPct > 20 ? 'text-amber' : 'text-text-dim'}`}>
                    -{fL(gap)}
                  </span>
                )}
              </button>
            )
          })}
          <div className="border-t border-border-dim pt-1.5 mt-1.5 text-meta text-text-dim text-center">
            Inner ring = target · Outer = actual · Click to filter
          </div>
        </div>
      </div>
    </div>
  )
}

function PnlWaterfall({ holdings }) {
  const { gainers, losers } = useMemo(() => {
    const sorted = [...holdings].sort((a, b) => b.pnl - a.pnl)
    return {
      gainers: sorted.filter(h => h.pnl > 0).slice(0, 5),
      losers: sorted.filter(h => h.pnl < 0).slice(-5).reverse(),
    }
  }, [holdings])

  const chartData = [
    ...gainers.map(h => ({ sym: h.sym, pnl: h.pnl, fill: '#10B981' })),
    ...losers.map(h => ({ sym: h.sym, pnl: h.pnl, fill: '#EF4444' })),
  ]

  return (
    <div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A305020" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#3A6080', fontSize: 9, fontFamily: 'IBM Plex Mono' }}
              tickFormatter={v => `${v >= 0 ? '+' : ''}${(v / 100000).toFixed(1)}L`} />
            <YAxis type="category" dataKey="sym" width={70}
              tick={{ fill: '#7A9BB8', fontSize: 10, fontFamily: 'IBM Plex Mono', fontWeight: 600 }} />
            <ReferenceLine x={0} stroke="#3A6080" strokeWidth={1} />
            <Bar dataKey="pnl" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {chartData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
              <LabelList dataKey="pnl" position="right"
                formatter={v => `${v >= 0 ? '+' : ''}${(v / 100000).toFixed(2)}L`}
                style={{ fill: '#7A9BB8', fontSize: 9, fontFamily: 'IBM Plex Mono' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RiskPanel({ holdings, insightsData }) {
  const slWatch = useMemo(() =>
    holdings
      .filter(h => h.sl && h.ltp)
      .map(h => ({ ...h, slPct: (h.ltp - h.sl) / h.sl * 100, breached: h.ltp <= h.sl }))
      .filter(h => h.breached || h.slPct < 8)
      .sort((a, b) => a.slPct - b.slPct),
    [holdings]
  )

  const thesisBreaks = useMemo(() =>
    holdings
      .filter(h => {
        const pos = insightsData?.positions?.[h.sym]
        return pos?.thesisStatus === 'broken' || pos?.thesisStatus === 'watch' || pos?.thesisStatus === 'weakening'
      })
      .map(h => {
        const pos = insightsData.positions[h.sym]
        return { ...h, status: pos.thesisStatus, bias: pos.actionBias, summary: pos.summary }
      }),
    [holdings, insightsData]
  )

  const misaligned = useMemo(() =>
    holdings.filter(h => h.conv && h.conv <= 5 && h.value > 100000)
      .sort((a, b) => a.conv - b.conv),
    [holdings]
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* SL Watch */}
      <div className="bg-dark/40 border border-border-dim rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-3.5 h-3.5 text-red" />
          <span className="text-meta uppercase tracking-[0.12em] font-bold text-text-dim">Stop-Loss Watch</span>
          {slWatch.length > 0 && <span className="text-meta font-bold text-red bg-red/15 px-1.5 py-0.5 rounded">{slWatch.length}</span>}
        </div>
        {slWatch.length === 0 ? (
          <div className="text-meta text-green font-medium py-4 text-center">All positions safely above SL</div>
        ) : (
          <div className="space-y-2">
            {slWatch.slice(0, 5).map(h => (
              <div key={h.sym} className="flex items-center justify-between bg-dark/50 rounded-lg px-3 py-2 border border-white/5">
                <div>
                  <span className="text-meta font-bold text-white">{h.sym}</span>
                  <div className="text-meta font-mono text-text-dim">SL ₹{Math.round(h.sl)} · LTP ₹{Math.round(h.ltp)}</div>
                </div>
                <span className={`text-meta font-mono font-bold ${h.breached ? 'text-red' : 'text-amber'}`}>
                  {h.breached ? 'BREACH' : `${h.slPct.toFixed(1)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thesis Breaks */}
      <div className="bg-dark/40 border border-border-dim rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber" />
          <span className="text-meta uppercase tracking-[0.12em] font-bold text-text-dim">Thesis Alerts</span>
          {thesisBreaks.length > 0 && <span className="text-meta font-bold text-amber bg-amber/15 px-1.5 py-0.5 rounded">{thesisBreaks.length}</span>}
        </div>
        {thesisBreaks.length === 0 ? (
          <div className="text-meta text-green font-medium py-4 text-center">All theses intact</div>
        ) : (
          <div className="space-y-2">
            {thesisBreaks.slice(0, 5).map(h => (
              <div key={h.sym} className="bg-dark/50 rounded-lg px-3 py-2 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-meta font-bold text-white">{h.sym}</span>
                  <div className="flex gap-1.5">
                    <span className={`text-meta font-bold uppercase px-1.5 py-0.5 rounded ${
                      h.status === 'broken' ? 'text-red bg-red/15' :
                      h.status === 'weakening' ? 'text-amber bg-amber/10' : 'text-amber bg-amber/15'
                    }`}>{h.status}</span>
                    {h.bias && <span className={`text-meta font-bold uppercase px-1.5 py-0.5 rounded ${
                      h.bias === 'EXIT' ? 'text-red bg-red/15' :
                      h.bias === 'TRIM' ? 'text-amber bg-amber/15' : 'text-text-dim bg-white/5'
                    }`}>{h.bias}</span>}
                  </div>
                </div>
                {h.summary && <p className="text-meta text-text-dim leading-relaxed line-clamp-2">{h.summary}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Low Conviction Heavy Positions */}
      <div className="bg-dark/40 border border-border-dim rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-meta uppercase tracking-[0.12em] font-bold text-text-dim">Low Conv, High Weight</span>
          {misaligned.length > 0 && <span className="text-meta font-bold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">{misaligned.length}</span>}
        </div>
        {misaligned.length === 0 ? (
          <div className="text-meta text-green font-medium py-4 text-center">No conviction misalignment</div>
        ) : (
          <div className="space-y-2">
            {misaligned.slice(0, 5).map(h => (
              <div key={h.sym} className="flex items-center justify-between bg-dark/50 rounded-lg px-3 py-2 border border-white/5">
                <div>
                  <span className="text-meta font-bold text-white">{h.sym}</span>
                  <div className="text-meta font-mono text-text-dim">Conv {h.conv} · {fL(h.value)}</div>
                </div>
                <span className="text-meta font-mono font-bold text-zinc-400">{fP(h.pnlPct)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ThemeExposure({ holdings, totalVal }) {
  const themes = useMemo(() => {
    const map = {}
    holdings.forEach(h => {
      const t = h.theme || 'Other'
      if (!map[t]) map[t] = { theme: t, value: 0, count: 0 }
      map[t].value += h.value
      map[t].count++
    })
    return Object.values(map)
      .map(t => ({ ...t, pct: totalVal > 0 ? (t.value / totalVal * 100) : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [holdings, totalVal])

  const maxPct = Math.max(...themes.map(t => t.pct), 1)
  const themeColors = {
    'T&D': '#3B82F6', 'Banking': '#14B8A6', 'NBFC': '#8B5CF6', 'Infra': '#F59E0B',
    'Defence': '#EF4444', 'FMCG': '#10B981', 'Consumer': '#F97316', 'Auto': '#EAB308',
    'Auto Ancil': '#EAB308', 'Water': '#3B82F6', 'EMS': '#8B5CF6', 'Renewable': '#10B981',
    'Cables': '#F59E0B', 'Construction': '#F97316', 'IT': '#6B7280', 'Hospitality': '#14B8A6',
    'Energy': '#EAB308', 'Chem': '#8B5CF6', 'Retail': '#F59E0B', 'ETF': '#6B7280',
    'Gold': '#EAB308', 'Silver': '#7A9BB8', 'Cash': '#22C55E', 'T&D+DC': '#3B82F6',
  }

  return (
    <div>
      <div className="space-y-1.5">
        {themes.map(t => (
          <div key={t.theme} className="flex items-center gap-2 group">
            <span className="text-meta font-semibold text-text-sec w-[70px] truncate group-hover:text-white transition-colors">{t.theme}</span>
            <div className="flex-1 h-4 bg-dark/60 rounded overflow-hidden">
              <div className="h-full rounded transition-all duration-500"
                style={{ width: `${(t.pct / maxPct) * 100}%`, background: themeColors[t.theme] || '#6B7280', opacity: 0.75 }} />
            </div>
            <span className="text-meta font-mono font-bold text-text-dim w-[40px] text-right">{t.pct.toFixed(1)}%</span>
            <span className="text-meta font-mono text-text-dim w-[50px] text-right">{fL(t.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PortfolioVisuals({ holdings, totals, bucketTargets, insightsData, onBucketFilter, onStockSelect }) {
  const totalVal = holdings.reduce((s, h) => s + (h.value || 0), 0)
  const totalInv = holdings.reduce((s, h) => s + (h.invested || 0), 0)
  const totalPnL = totalVal - totalInv
  const targetTotal = Object.values(bucketTargets || {}).reduce((s, b) => s + (b.target || 0), 0)
  const gapToTarget = targetTotal - totalVal

  const bucketVals = useMemo(() => {
    const map = {}
    holdings.forEach(h => {
      map[h.bucket] = (map[h.bucket] || 0) + (h.value || 0)
    })
    return map
  }, [holdings])

  const winnersCount = holdings.filter(h => h.pnl > 0).length
  const losersCount = holdings.filter(h => h.pnl < 0).length

  return (
    <div className="space-y-4 mb-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Portfolio Value" icon={Target}
          value={fL(totalVal)}
          sub={`${holdings.length} positions`}
          color="var(--text-pri)"
        />
        <KpiCard
          label="Unrealized P&L" icon={totalPnL >= 0 ? TrendingUp : TrendingDown}
          value={`${totalPnL >= 0 ? '+' : ''}${fL(totalPnL)}`}
          sub={fP(totalInv > 0 ? totalPnL / totalInv : 0)}
          color={totalPnL >= 0 ? 'var(--green)' : 'var(--red)'}
        />
        <KpiCard
          label="Gap to ₹1.25Cr" icon={Crosshair}
          value={gapToTarget > 0 ? `−${fL(gapToTarget)}` : 'Target hit'}
          sub={gapToTarget > 0 ? `${(totalVal / targetTotal * 100).toFixed(0)}% deployed` : ''}
          color={gapToTarget > 0 ? 'var(--amber)' : 'var(--green)'}
        />
        <KpiCard
          label="Win Rate" icon={Shield}
          value={`${winnersCount}W / ${losersCount}L`}
          sub={`${holdings.length > 0 ? (winnersCount / holdings.length * 100).toFixed(0) : 0}% winning`}
          color={winnersCount > losersCount ? 'var(--green)' : 'var(--red)'}
        />
      </div>

      {/* Row 2: Allocation donut (full width — room for the target-vs-actual legend) */}
      <BucketDonut
        buckets={bucketVals}
        totalVal={totalVal}
        bucketTargets={bucketTargets || {}}
        onBucketClick={onBucketFilter}
      />

      {/* Collapsible deep-dive sections — collapsed by default, open on demand */}
      <SectionCard
        icon={<Map className="w-3.5 h-3.5" />}
        title="Conviction Map"
        summary="capital vs conviction — where are you mis-sized?"
        defaultOpen={false}
      >
        <ConvictionMap holdings={holdings} totalVal={totalVal} onSelect={onStockSelect} />
      </SectionCard>

      <SectionCard
        icon={<Crosshair className="w-3.5 h-3.5" />}
        title="Calibration Scorecard"
        summary="does your conviction predict your returns?"
        defaultOpen={false}
      >
        <CalibrationScorecard holdings={holdings} />
      </SectionCard>

      <SectionCard
        icon={<BarChart2 className="w-3.5 h-3.5" />}
        title="P&L Drivers · Theme Exposure"
        summary="top gainers, losers & sector concentration"
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PnlWaterfall holdings={holdings} />
          <ThemeExposure holdings={holdings} totalVal={totalVal} />
        </div>
      </SectionCard>

      <SectionCard
        icon={<Shield className="w-3.5 h-3.5" />}
        title="Risk Register"
        summary="stop-loss proximity · thesis alerts · conviction misalignment"
        defaultOpen={false}
      >
        <RiskPanel holdings={holdings} insightsData={insightsData} />
      </SectionCard>
    </div>
  )
}
