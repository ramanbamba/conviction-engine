import { useState } from 'react'

// Quadrant config
const CONV_THRESHOLD   = 7    // vertical divider
const WEIGHT_THRESHOLD = 5    // horizontal divider (%)

function quadrant(conv, weight) {
  const hiConv   = conv   >= CONV_THRESHOLD
  const hiWeight = weight >= WEIGHT_THRESHOLD
  if (hiConv  && hiWeight)  return 'correct'   // green  — high conv, high weight
  if (!hiConv && hiWeight)  return 'trim'      // red    — low conv, high weight (inverse sizing)
  if (hiConv  && !hiWeight) return 'add'       // amber  — high conv, low weight (underweighted)
  return 'neutral'                              // gray   — low conv, low weight
}

const Q_COLORS = {
  correct: { dot: '#10B981', ring: 'rgba(16,185,129,0.25)',  fill: 'rgba(16,185,129,0.04)' },
  trim:    { dot: '#EF4444', ring: 'rgba(239,68,68,0.25)',   fill: 'rgba(239,68,68,0.05)'  },
  add:     { dot: '#F59E0B', ring: 'rgba(245,158,11,0.25)',  fill: 'rgba(245,158,11,0.04)' },
  neutral: { dot: '#3A6080', ring: 'rgba(58,96,128,0.2)',    fill: 'rgba(255,255,255,0.01)'},
}

const Q_LABELS = {
  correct: 'Correct sizing',
  trim:    '⚠ Inverse sizing — trim',
  add:     '↑ Under-weighted — add',
  neutral: 'Monitor / OK',
}

export default function ConvictionMap({ holdings, totalVal, aiInsights, onSelect }) {
  const [tooltip, setTooltip] = useState(null)

  if (!holdings?.length || !totalVal) return null

  // Build dot data
  const dots = holdings.map(h => {
    const weight = (h.value / totalVal) * 100
    const q      = quadrant(h.conv, weight)
    const action = aiInsights?.stocks?.[h.sym]?.action
    return { ...h, weight, q, action }
  })

  const maxWeight = Math.max(...dots.map(d => d.weight), 10) * 1.15
  const maxValue  = Math.max(...dots.map(d => d.value))

  // SVG canvas
  const W    = 600
  const H    = 320
  const PAD  = { top: 16, right: 24, bottom: 44, left: 48 }
  const PW   = W - PAD.left - PAD.right
  const PH   = H - PAD.top  - PAD.bottom

  const toX = (conv)   => PAD.left + (conv / 10) * PW
  const toY = (weight) => PAD.top  + PH - (weight / maxWeight) * PH
  const toR  = (value) => 4 + Math.sqrt(value / maxValue) * 14

  const xMid = toX(CONV_THRESHOLD)
  const yMid = toY(WEIGHT_THRESHOLD)

  // Summary counts
  const qCounts = { correct: 0, trim: 0, add: 0, neutral: 0 }
  dots.forEach(d => qCounts[d.q]++)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-xs text-text-dim">Weight vs conviction — exposes inverse sizing</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { key: 'trim',    label: 'Trim',    color: 'bg-red/40'   },
            { key: 'add',     label: 'Add',     color: 'bg-amber/40' },
            { key: 'correct', label: 'Correct', color: 'bg-green/40' },
            { key: 'neutral', label: 'Hold',    color: 'bg-white/10' },
          ].map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-1.5 text-meta text-text-sec">
              <div className={`w-2 h-2 rounded-full ${color}`} />
              <span>{qCounts[key]} {label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Map */}
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[320px]"
          style={{ maxHeight: 340 }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Quadrant fills */}
          {/* Top-left: trim (low conv, high weight) */}
          <rect x={PAD.left} y={PAD.top} width={xMid - PAD.left} height={yMid - PAD.top}
            fill={Q_COLORS.trim.fill} />
          {/* Top-right: correct */}
          <rect x={xMid} y={PAD.top} width={PAD.left + PW - xMid} height={yMid - PAD.top}
            fill={Q_COLORS.correct.fill} />
          {/* Bottom-left: neutral */}
          <rect x={PAD.left} y={yMid} width={xMid - PAD.left} height={PAD.top + PH - yMid}
            fill={Q_COLORS.neutral.fill} />
          {/* Bottom-right: add */}
          <rect x={xMid} y={yMid} width={PAD.left + PW - xMid} height={PAD.top + PH - yMid}
            fill={Q_COLORS.add.fill} />

          {/* Quadrant dividers */}
          <line x1={xMid} y1={PAD.top} x2={xMid} y2={PAD.top + PH}
            stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 3" />
          <line x1={PAD.left} y1={yMid} x2={PAD.left + PW} y2={yMid}
            stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 3" />

          {/* Quadrant corner labels */}
          <text x={PAD.left + 6}     y={PAD.top + 14}   fontSize="8" fill="rgba(239,68,68,0.5)"   fontWeight="600">TRIM</text>
          <text x={xMid + 6}         y={PAD.top + 14}   fontSize="8" fill="rgba(16,185,129,0.5)"  fontWeight="600">CORRECT</text>
          <text x={PAD.left + 6}     y={PAD.top + PH - 6} fontSize="8" fill="rgba(58,96,128,0.6)"  fontWeight="600">HOLD</text>
          <text x={xMid + 6}         y={PAD.top + PH - 6} fontSize="8" fill="rgba(245,158,11,0.5)" fontWeight="600">ADD</text>

          {/* X axis */}
          <line x1={PAD.left} y1={PAD.top + PH} x2={PAD.left + PW} y2={PAD.top + PH}
            stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          {[1,2,3,4,5,6,7,8,9,10].map(v => (
            <g key={v}>
              <line x1={toX(v)} y1={PAD.top + PH} x2={toX(v)} y2={PAD.top + PH + 4}
                stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <text x={toX(v)} y={PAD.top + PH + 14} textAnchor="middle"
                fontSize="9" fill="rgba(122,155,184,0.6)">{v}</text>
            </g>
          ))}
          <text x={PAD.left + PW / 2} y={H - 2} textAnchor="middle"
            fontSize="9" fill="rgba(122,155,184,0.5)">Conviction (1–10)</text>

          {/* Y axis */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PH}
            stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          {[0, 2, 4, 6, 8, 10, 12].filter(v => v <= maxWeight + 1).map(v => (
            <g key={v}>
              <line x1={PAD.left - 4} y1={toY(v)} x2={PAD.left} y2={toY(v)}
                stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <text x={PAD.left - 7} y={toY(v) + 3} textAnchor="end"
                fontSize="9" fill="rgba(122,155,184,0.6)">{v}%</text>
            </g>
          ))}

          {/* Dots */}
          {dots.map((d) => {
            const cx = toX(d.conv)
            const cy = toY(d.weight)
            const r  = toR(d.value)
            const c  = Q_COLORS[d.q]
            const isHovered = tooltip?.sym === d.sym

            return (
              <g key={d.sym}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect?.(d.sym)}
                onMouseEnter={e => {
                  const svgEl = e.currentTarget.closest('svg')
                  const svgRect = svgEl.getBoundingClientRect()
                  const containerRect = svgEl.parentElement.getBoundingClientRect()
                  const scaleX = svgRect.width  / W
                  const scaleY = svgRect.height / H
                  setTooltip({
                    sym: d.sym, name: d.name, conv: d.conv, weight: d.weight,
                    bucket: d.bucket, pnlPct: d.pnlPct, action: d.action, q: d.q,
                    px: (cx * scaleX) + (svgRect.left - containerRect.left),
                    py: (cy * scaleY) + (svgRect.top  - containerRect.top),
                  })
                }}
              >
                {isHovered && (
                  <circle cx={cx} cy={cy} r={r + 5} fill={c.ring} />
                )}
                <circle cx={cx} cy={cy} r={r} fill={c.dot} opacity={isHovered ? 1 : 0.75} />
                {r >= 10 && (
                  <text x={cx} y={cy + 3.5} textAnchor="middle"
                    fontSize="7.5" fontWeight="700" fill="rgba(0,0,0,0.85)"
                    style={{ pointerEvents: 'none' }}>
                    {d.sym.length > 6 ? d.sym.slice(0, 5) + '…' : d.sym}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-deep border border-white/15 rounded-xl shadow-xl px-3 py-2.5 text-xs"
            style={{
              left:      tooltip.px + 14,
              top:       tooltip.py - 10,
              minWidth: '200px',
              maxWidth: '260px',
            }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-white font-mono">{tooltip.sym}</span>
              <span className="text-meta text-text-dim">{tooltip.bucket}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-meta mb-1.5">
              <div>
                <span className="text-text-dim">Conviction  </span>
                <span className="font-bold text-white">{tooltip.conv}/10</span>
              </div>
              <div>
                <span className="text-text-dim">Weight  </span>
                <span className="font-bold text-white">{tooltip.weight.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-text-dim">P&amp;L  </span>
                <span className={`font-bold ${tooltip.pnlPct >= 0 ? 'text-green' : 'text-red'}`}>
                  {tooltip.pnlPct >= 0 ? '+' : ''}{(tooltip.pnlPct * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-text-dim">Signal  </span>
                <span className={`font-bold ${
                  tooltip.q === 'trim'    ? 'text-red'   :
                  tooltip.q === 'add'     ? 'text-amber' :
                  tooltip.q === 'correct' ? 'text-green' : 'text-text-sec'
                }`}>{Q_LABELS[tooltip.q]}</span>
              </div>
            </div>
            {tooltip.action && (
              <p className="text-meta text-text-sec italic border-t border-white/5 pt-1.5 leading-snug">
                {tooltip.action}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
