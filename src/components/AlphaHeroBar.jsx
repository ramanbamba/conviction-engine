import React, { useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line } from 'recharts'
import benchmarkData from '../data/benchmark.json'

export default function AlphaHeroBar() {
  const [activeWindow, setActiveWindow] = useState('ytd') // 'ytd' | '1y' | '3y' | 'inception'

  // Graceful degradation check
  const data = benchmarkData || {}
  const fetchedAt = data.fetchedAt
  const windows = data.windows || {}
  const spark1y = data.spark1y || []

  const activeData = windows[activeWindow] || {}
  const alphaVal = activeData.alpha // decimal return, e.g. 0.1411

  // Format alpha percentage
  const formatAlpha = (val) => {
    if (val == null) return '—'
    const pct = val * 100
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}%`
  }

  // Alpha color based on sign & underperformance risk
  const getAlphaColor = (val) => {
    if (val == null) return 'text-text-dim'
    const pct = val * 100
    if (pct > -2 && pct < 2) return 'text-amber animate-pulse'
    return pct > 0 ? 'text-green' : 'text-red'
  }

  const handleToggle = (win) => {
    setActiveWindow(win)
  }

  // Attribution strip item formatter
  const renderAttributionItem = (key, label) => {
    const winData = windows[key] || {}
    const val = winData.alpha
    if (val == null) return null
    const colorClass = val >= 0 ? 'text-green' : 'text-red'
    return (
      <div key={key} className="flex items-center gap-1">
        <span className="text-text-dim uppercase tracking-wider font-bold">{label}:</span>
        <span className={`font-mono font-extrabold ${colorClass}`}>
          {formatAlpha(val)}
        </span>
      </div>
    )
  }

  return (
    <div className="w-full py-1 select-none">
      <div className="grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto] gap-4 md:gap-6 items-center">
        
        {/* Left: Label + Hero alpha value + Toggle pills */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="flex flex-col">
            <span className="text-micro text-text-dim uppercase tracking-tracked-15 font-black">
              ALPHA vs Nifty 50
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className={`text-heading font-mono font-black tracking-tight leading-none ${getAlphaColor(alphaVal)}`}>
                {formatAlpha(alphaVal)}
              </span>
              <span className="text-micro text-text-dim uppercase font-bold tracking-wider">
                {activeWindow}
              </span>
            </div>
          </div>

          {/* Toggle pills */}
          <div className="flex items-center bg-white/2 border border-white/5 p-0.5 rounded-lg">
            {['ytd', '1y', '3y', 'inception'].map((win) => {
              const label = win === 'inception' ? 'ALL' : win.toUpperCase()
              const isActive = activeWindow === win
              return (
                <button
                  key={win}
                  onClick={() => handleToggle(win)}
                  className={`px-2 py-1 text-micro font-black rounded uppercase tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'text-text-dim hover:text-text-sec'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Center: equity curve — portfolio (green area) vs benchmark (zinc dashed) */}
        <div className="w-full min-w-[100px] h-[52px] md:h-[60px]">
          {spark1y.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={spark1y} margin={{ top: 3, bottom: 2, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id="alphaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* Benchmark: Zinc, dashed, thin */}
                <Line type="monotone" dataKey="benchIdx" stroke="#52525b" strokeWidth={1.5} strokeDasharray="3 3" dot={false} activeDot={false} />
                {/* Portfolio: green line + gradient fill, end dot */}
                <Area type="monotone" dataKey="portIdx" stroke="#10B981" strokeWidth={2.25} fill="url(#alphaFill)"
                  dot={false} activeDot={false} isAnimationActive={false}
                  // end-point marker
                  label={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-dim text-micro uppercase tracking-wider">
              No Timeline Data
            </div>
          )}
        </div>

        {/* Right: Attribution strip (hidden on mobile below md) */}
        <div className="hidden md:flex items-center gap-4 text-caption border-l border-white/5 pl-5">
          {renderAttributionItem('ytd', 'YTD')}
          <span className="text-white/10 select-none">•</span>
          {renderAttributionItem('1y', '1Y')}
          <span className="text-white/10 select-none">•</span>
          {renderAttributionItem('3y', '3Y')}
          <span className="text-white/10 select-none">•</span>
          {renderAttributionItem('inception', 'Inception')}
        </div>

      </div>
    </div>
  )
}
