import React, { useState, useMemo } from 'react'
import { stockAlphaAttribution } from '../lib/attribution'
import benchmarkData from '../data/benchmark.json'

export default function AlphaAttribution({ holdings = [] }) {
  const [windowKey, setWindowKey] = useState('ytd') // 'ytd' | '1y'

  // If benchmarkData or holdings empty, do not render (null)
  const attribution = useMemo(() => {
    if (!holdings?.length || !benchmarkData?.windows) return []
    return stockAlphaAttribution(holdings, benchmarkData, windowKey)
  }, [holdings, windowKey])

  const [showAll, setShowAll] = useState(false)

  if (attribution.length === 0) return null

  // Divide into top, bottom, and middle range
  const { topContributors, bottomContributors, middleRange } = useMemo(() => {
    const top = []
    const bottom = []
    const middle = []

    attribution.forEach(item => {
      if (item.contribution > 0.005) {
        top.push(item)
      } else if (item.contribution < -0.005) {
        bottom.push(item)
      } else {
        middle.push(item)
      }
    })

    // Slice to top 5 and bottom 5 respectively
    return {
      topContributors: top.slice(0, 5),
      bottomContributors: bottom.slice(0, 5),
      middleRange: middle
    }
  }, [attribution])

  // Find max contribution for scaling
  const maxContribution = useMemo(() => {
    if (attribution.length === 0) return 0.01
    return Math.max(...attribution.map(a => Math.abs(a.contribution)), 0.001)
  }, [attribution])

  const renderedItems = showAll 
    ? attribution 
    : [...topContributors, ...bottomContributors]

  const formatContribution = (val) => {
    const pct = val * 100
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}pp`
  }

  return (
    <div className="space-y-4 pt-4 border-t border-white/5 font-sans select-none">
      
      {/* Header and selector pills */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-meta text-zinc-500 font-bold uppercase tracking-wider">
          Alpha Attribution ({windowKey.toUpperCase()})
        </span>
        <div className="flex gap-1 bg-black/20 border border-white/5 rounded-lg p-0.5">
          {[
            { id: 'ytd', label: 'YTD' },
            { id: '1y',  label: '1Y'  }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => { setWindowKey(opt.id); setShowAll(false) }}
              className={`px-2.5 py-0.5 text-micro rounded font-mono font-bold cursor-pointer transition-all uppercase ${
                windowKey === opt.id 
                  ? 'bg-zinc-800 text-white' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Horizontal Bar Chart list */}
      <div className="space-y-2">
        {renderedItems.map((item) => {
          const valPct = (Math.abs(item.contribution) / maxContribution) * 40 // Max 40% width
          const isPositive = item.contribution >= 0
          
          return (
            <div key={item.sym} className="flex items-center text-caption font-mono h-5 py-1">
              {/* Symbol */}
              <span className="text-white font-bold w-14 shrink-0 text-left truncate">{item.sym}</span>
              
              {/* Scale bar */}
              <div className="flex-1 flex items-center h-full relative">
                {/* Center marker */}
                <div className="absolute left-1/2 -translate-x-1/2 w-[1px] h-full bg-white/10" />
                
                {isPositive ? (
                  <div className="absolute left-1/2 h-full rounded-r bg-green/75" style={{ width: `${valPct}%` }} />
                ) : (
                  <div className="absolute right-1/2 h-full rounded-l bg-red/75" style={{ width: `${valPct}%` }} />
                )}
              </div>

              {/* Contribution score */}
              <span className={`w-14 font-mono font-black text-right shrink-0 ${isPositive ? 'text-green' : 'text-red'}`}>
                {formatContribution(item.contribution)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Show all middle-range items toggle */}
      {middleRange.length > 0 && (
        <div className="text-center pt-1 border-t border-dashed border-white/5">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-micro text-zinc-500 hover:text-white uppercase tracking-wider font-mono font-bold cursor-pointer bg-white/2 border border-white/5 px-2.5 py-1 rounded"
          >
            {showAll ? 'Collapse middle range' : `Show all (+${middleRange.length} minor)`}
          </button>
        </div>
      )}

    </div>
  )
}
