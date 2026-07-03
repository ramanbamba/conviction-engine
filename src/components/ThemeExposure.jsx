import React, { useMemo, useState } from 'react'
import { themeExposure } from '../lib/themeExposure'
import { fL, fP } from '../lib/format'

const CAP = 8

const THEME_COLORS = {
  Defence: '#10B981',      // green
  Renewables: '#F59E0B',   // amber
  Infra: '#3B82F6',        // blue
  IT: '#6B7280',           // gray
  EMS: '#8B5CF6',          // purple-like
  BFSI: '#EC4899',         // pink-like
  FMCG: '#14B8A6',         // teal
  Auto: '#F97316',         // orange
  Unclassified: '#4B5563'  // medium gray
}

const DEFAULT_COLOR = '#9CA3AF'

export default function ThemeExposure({ holdings = [] }) {
  const [showAll, setShowAll] = useState(false)
  const themes = useMemo(() => themeExposure(holdings), [holdings])

  if (themes.length === 0) return null

  const visible = showAll ? themes : themes.slice(0, CAP)
  const hiddenCount = themes.length - CAP

  return (
    <div className="space-y-4 pt-4 border-t border-white/5 select-none font-sans">
      <div className="flex items-center justify-between">
        <span className="text-meta text-zinc-500 font-bold uppercase tracking-wider">
          Theme & Sector Exposure
        </span>
        <span className="text-micro text-zinc-500 font-mono">
          {themes.length} themes
        </span>
      </div>

      {/* Stacked allocation bar */}
      <div className="w-full bg-white/5 h-[6px] rounded-full overflow-hidden flex">
        {themes.map(t => (
          <div
            key={t.theme}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${t.pct * 100}%`, backgroundColor: THEME_COLORS[t.theme] || DEFAULT_COLOR }}
            title={`${t.theme}: ${fP(t.pct)} (${fL(t.value)})`}
          />
        ))}
      </div>

      {/* List — capped */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
        {visible.map(t => (
          <div key={t.theme} className="flex items-center justify-between text-caption font-mono">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: THEME_COLORS[t.theme] || DEFAULT_COLOR }} />
              <span className="text-zinc-300 font-semibold truncate">{t.theme}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-zinc-500">{fL(t.value)}</span>
              <span className="text-white font-bold min-w-[36px] text-right">{fP(t.pct)}</span>
            </div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="text-micro text-zinc-500 hover:text-zinc-300 font-mono cursor-pointer transition-colors"
        >
          {showAll ? '↑ Show less' : `↓ Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  )
}
