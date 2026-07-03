import React, { useMemo } from 'react'
import { buildDailyPulse } from '../lib/dailyPulse'

export default function DailyPulseStrip({ signals = {}, aiInsights = {} }) {
  const bullets = useMemo(() => {
    return buildDailyPulse(signals, aiInsights)
  }, [signals, aiInsights])

  return (
    <div className="w-full bg-[#050D18]/40 border-y border-white/5 h-8 flex items-center overflow-x-auto no-scrollbar font-sans select-none shrink-0 px-4">
      <div className="flex items-center gap-4 whitespace-nowrap text-micro font-mono">
        <span className="text-zinc-500 font-extrabold uppercase tracking-widest shrink-0 border-r border-white/5 pr-4 mr-1">
          Daily Pulse
        </span>
        <div className="flex items-center gap-6">
          {bullets.map((bullet, idx) => {
            let textColor = 'text-zinc-400'
            if (bullet.type === 'risk') textColor = 'text-red font-bold'
            if (bullet.type === 'signal') textColor = 'text-green font-bold'

            return (
              <div key={idx} className="flex items-center gap-2">
                <span className={bullet.type === 'risk' ? 'text-red animate-pulse' : bullet.type === 'signal' ? 'text-green' : 'text-zinc-600'}>
                  ●
                </span>
                <span className={textColor}>
                  {bullet.text}
                </span>
                {idx < bullets.length - 1 && (
                  <span className="text-zinc-800 ml-4 font-normal select-none">|</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
