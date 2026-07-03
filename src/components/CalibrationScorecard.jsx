import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { convColor, fP } from '../lib/format'

// Equity-only — ETFs and cash don't have conviction in the same sense
const SKIP = new Set(['LIQUIDBEES', 'GOLDBEES', 'SILVERBEES', 'METALIETF', 'MOMOMENTUM'])

const BANDS = [
  { label: 'Strong', range: '8–10', min: 8, cap: 11, color: '#10B981' },
  { label: 'Solid',  range: '6–7.9', min: 6, cap: 8,  color: '#a1a1aa' },
  { label: 'Watch',  range: '4–5.9', min: 4, cap: 6,  color: '#F59E0B' },
  { label: 'Weak',   range: '<4',    min: 0, cap: 4,  color: '#EF4444' },
]

function ScatterDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null
  const { r, color, outlier, sym } = payload
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.75}
        stroke={outlier ? '#E0EEFF' : color} strokeWidth={outlier ? 1 : 0} />
      {outlier && (
        <text x={cx + r + 3} y={cy + 4} fill="#B0D0EE" fontSize={8}
          fontFamily="IBM Plex Mono" fontWeight={700}>{sym}</text>
      )}
    </g>
  )
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{
      background: '#0D1E35', border: '1px solid #1A3050', borderRadius: 8,
      padding: '8px 12px', fontFamily: 'IBM Plex Mono', fontSize: 11,
    }}>
      <div style={{ color: '#E0EEFF', fontWeight: 700, marginBottom: 2 }}>{d.sym}</div>
      <div style={{ color: d.x >= 0 ? '#10B981' : '#EF4444' }}>
        {d.x >= 0 ? '+' : ''}{d.x.toFixed(1)}% return
      </div>
      <div style={{ color: convColor(d.y) }}>Conv {d.y}</div>
    </div>
  )
}

export default function CalibrationScorecard({ holdings }) {
  const equity = useMemo(() =>
    holdings.filter(h => !SKIP.has(h.sym) && h.conv != null && h.pnlPct != null),
    [holdings]
  )

  const points = useMemo(() =>
    equity.map(h => {
      const pct = h.pnlPct * 100
      // Label: low conv outperforming, high conv struggling, or extreme movers
      const outlier =
        (pct > 15 && h.conv < 6) ||
        (pct < -10 && h.conv >= 7) ||
        (pct > 25 && h.conv >= 8) ||
        Math.abs(pct) > 35
      const r = Math.max(4, Math.min(11, Math.sqrt((h.value || 0) / 80000) * 2.5))
      return { sym: h.sym, x: pct, y: h.conv, color: convColor(h.conv), r, outlier }
    }),
    [equity]
  )

  const bands = useMemo(() =>
    BANDS.map(band => {
      const inBand = equity.filter(h => h.conv >= band.min && h.conv < band.cap)
      const avgRet = inBand.length
        ? inBand.reduce((s, h) => s + h.pnlPct, 0) / inBand.length
        : 0
      const totalVal = inBand.reduce((s, h) => s + (h.value || 0), 0)
      return { ...band, count: inBand.length, avgRet, totalVal }
    }),
    [equity]
  )

  // Headline insight: best and worst band by avg return
  const sorted = [...bands].filter(b => b.count > 0).sort((a, b) => b.avgRet - a.avgRet)
  const topBand = sorted[0]
  const bottomBand = sorted[sorted.length - 1]

  return (
    <div>
      {topBand && bottomBand && topBand !== bottomBand && (
        <div className="text-meta font-mono mb-3">
          <span style={{ color: '#10B981' }}>{topBand.label}</span>
          <span className="text-text-dim"> avg </span>
          <span style={{ color: topBand.avgRet >= 0 ? '#10B981' : '#EF4444' }}>{fP(topBand.avgRet)}</span>
          <span className="text-text-dim"> · </span>
          <span style={{ color: bottomBand.color }}>{bottomBand.label}</span>
          <span className="text-text-dim"> avg </span>
          <span style={{ color: bottomBand.avgRet >= 0 ? '#10B981' : '#EF4444' }}>{fP(bottomBand.avgRet)}</span>
        </div>
      )}
      <p className="text-meta text-text-dim mb-4">Each dot = one position; size = position weight.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_190px] gap-4">
        {/* Scatter */}
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 52, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A305018" />
              <XAxis
                type="number" dataKey="x" name="Return"
                domain={['auto', 'auto']}
                tick={{ fill: '#3A6080', fontSize: 9, fontFamily: 'IBM Plex Mono' }}
                tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                label={{ value: 'Return vs cost', position: 'insideBottom', offset: -12, fill: '#3A6080', fontSize: 9, fontFamily: 'IBM Plex Mono' }}
              />
              <YAxis
                type="number" dataKey="y" name="Conviction"
                domain={[0, 10]} ticks={[2, 4, 6, 8, 10]}
                tick={{ fill: '#3A6080', fontSize: 9, fontFamily: 'IBM Plex Mono' }}
                label={{ value: 'Conv', angle: -90, position: 'insideLeft', offset: 10, fill: '#3A6080', fontSize: 9, fontFamily: 'IBM Plex Mono' }}
              />
              {/* Quadrant dividers */}
              <ReferenceLine x={0}  stroke="#3A6080" strokeWidth={1} strokeDasharray="4 4" />
              <ReferenceLine y={6}  stroke="#3A6080" strokeWidth={1} strokeDasharray="4 4" />
              {/* Quadrant labels */}
              <ReferenceLine x={0} y={8} label={{ value: '✓ calibrated', fill: '#10B98155', fontSize: 8, fontFamily: 'IBM Plex Mono', position: 'insideTopRight' }} stroke="none" />
              <ReferenceLine x={0} y={3} label={{ value: '⚠ rethink', fill: '#EF444455', fontSize: 8, fontFamily: 'IBM Plex Mono', position: 'insideBottomRight' }} stroke="none" />
              <Scatter data={points} shape={<ScatterDot />} isAnimationActive={false} />
              <CustomTooltip />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Band summary */}
        <div className="flex flex-col gap-2">
          <span className="text-meta uppercase tracking-[0.12em] font-bold text-text-dim">Avg Return by Band</span>
          {bands.map(b => {
            const barW = Math.min(100, Math.abs(b.avgRet) * 100 * 2) // 50% return = full bar
            return (
              <div key={b.label} className="bg-dark/40 rounded-lg px-3 py-2.5 border border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: b.color }} />
                    <span className="text-meta font-bold text-text-sec">{b.label}</span>
                    <span className="text-meta text-text-dim">{b.range}</span>
                  </div>
                  <span className="text-meta text-text-dim">{b.count}×</span>
                </div>
                {/* Mini bar */}
                <div className="h-1 bg-dark/60 rounded mb-1.5">
                  <div className="h-full rounded transition-all"
                    style={{
                      width: `${barW}%`,
                      background: b.avgRet >= 0 ? '#10B981' : '#EF4444',
                      opacity: 0.7,
                    }} />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-body font-black"
                    style={{ color: b.avgRet >= 0 ? '#10B981' : '#EF4444' }}>
                    {b.avgRet >= 0 ? '+' : ''}{(b.avgRet * 100).toFixed(1)}%
                  </span>
                  <span className="text-meta font-mono text-text-dim">
                    ₹{(b.totalVal / 100000).toFixed(1)}L
                  </span>
                </div>
              </div>
            )
          })}
          <p className="text-meta text-text-dim leading-relaxed mt-1">
            Excludes ETFs. Dashed lines = 0% return + conv 6 cutoff.
          </p>
        </div>
      </div>
    </div>
  )
}
