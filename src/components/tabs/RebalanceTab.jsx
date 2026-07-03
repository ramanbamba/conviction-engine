import React, { useState, useMemo } from 'react'
import { TrendingUp, Minus, Scissors, TrendingDown, Activity, LayoutGrid, Filter, Zap } from 'lucide-react'
import { convClass } from '../../lib/format'
import { useRebalance } from '../../hooks/useRebalance'
import StockDossier from '../StockDossier'
import DimensionHeatmap from '../DimensionHeatmap'
import BucketDrift from '../BucketDrift'
import ConvictionEngine from '../ConvictionEngine'
import ConcentrationEngine from '../ConcentrationEngine'
import SectionHeader from '../SectionHeader'
import SectionCard from '../SectionCard'
import DoubleDownPanel from '../DoubleDownPanel'
import { Crosshair } from 'lucide-react'

// Action visual config
const ACTIONS = [
  {
    key: 'doubleDown',
    label: 'Add',
    sub: 'High conviction, room to add',
    color: 'text-green',
    bg: 'bg-green/10',
    border: 'border-green/20',
    icon: TrendingUp,
    defaultOpen: true,
  },
  {
    key: 'hold',
    label: 'Hold',
    sub: 'At weight, thesis intact',
    color: 'text-zinc-400',
    bg: 'bg-white/5',
    border: 'border-white/10',
    icon: Minus,
    defaultOpen: false,
  },
  {
    key: 'trim',
    label: 'Trim',
    sub: 'Overweight or fading',
    color: 'text-amber',
    bg: 'bg-amber/10',
    border: 'border-amber/20',
    icon: Scissors,
    defaultOpen: false,
  },
  {
    key: 'churn',
    label: 'Exit',
    sub: 'Thesis weakening or broken',
    color: 'text-red',
    bg: 'bg-red/10',
    border: 'border-red/20',
    icon: TrendingDown,
    defaultOpen: true,
  },
]

function RowItem({ row, onClick }) {
  const conv = row.conviction
  const convColor = convClass(conv)

  const sizingColor =
    row.sizingGapPct > 10 ? 'text-amber' :
    row.sizingGapPct < -20 ? 'text-green' : 'text-zinc-400'

  return (
    <button
      onClick={onClick}
      className="w-full text-left py-3 hover:bg-white/2 transition-colors cursor-pointer group"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-black text-white text-body">{row.sym}</span>
          <span className="text-micro font-mono text-zinc-600 uppercase tracking-wider truncate">{row.bucket}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 font-mono text-caption">
          <span className={`font-black ${convColor}`}>{conv.toFixed(1)}</span>
          <span className={`${sizingColor} tabular-nums`}>{row.sizingPct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="text-caption text-zinc-500 font-mono leading-snug pl-0 group-hover:text-zinc-400 transition-colors">
        {row.driver}
      </div>
      {row.catalyst && row.daysToCatalyst != null && row.daysToCatalyst <= 30 && (
        <div className="text-micro text-amber font-mono mt-1 uppercase tracking-wider">
          ⚡ {row.catalyst.event} · {row.daysToCatalyst}d
        </div>
      )}
    </button>
  )
}

function Section({ cfg, rows, onSelect }) {
  const [open, setOpen] = useState(cfg.defaultOpen)
  const Icon = cfg.icon
  const count = rows.length

  return (
    <section className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/2 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
          <div className="text-left min-w-0">
            <div className={`text-body font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</div>
            <div className="text-micro text-zinc-500 truncate">{cfg.sub}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-body font-mono font-black ${cfg.color}`}>{count}</span>
          <span className={`text-zinc-600 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {open && count > 0 && (
        <div className="bg-deep/40 divide-y divide-white/5 px-4">
          {rows.map(row => (
            <RowItem key={row.sym} row={row} onClick={() => onSelect(row.sym)} />
          ))}
        </div>
      )}
      {open && count === 0 && (
        <div className="px-4 py-3 text-caption text-zinc-600 italic">No positions in this bucket.</div>
      )}
    </section>
  )
}

export default function RebalanceTab({
  holdings, aiInsights, insightsData, memory, filingsData, onRefreshThesis, onPersistMemory,
}) {
  const ladder = useRebalance({ holdings, aiInsights, insightsData })
  const [selectedSym, setSelectedSym] = useState(null)

  // All ranked rows in display order (for heatmap + bucket health)
  const allRows = useMemo(() => [
    ...ladder.doubleDown,
    ...ladder.hold,
    ...ladder.trim,
    ...ladder.churn,
  ], [ladder])

  return (
    <div className="space-y-4 tab-enter select-none">

      {/* ── THE LAB: this tab is exploration, not a decision wall (Phase 10x · 3) ── */}
      <SectionHeader
        title="The Target Lab"
        subtitle="The model-ideal book and the path to it. Canonical weights live on Portfolio, the day's moves on Today — this is where you interrogate why. Everything below is pull, not push."
      />

      {/* ── COMMAND CENTER: concentration, rotation, hedge ── */}
      <ConvictionEngine holdings={holdings} ladder={ladder} />

      {/* ── CONCENTRATION ENGINE: the model-ideal target book ── */}
      <SectionCard
        icon={<Crosshair className="w-3.5 h-3.5" />}
        title="Concentration Engine"
        summary="model-ideal target book · effective-N compression · feed winners, cut the tail"
        defaultOpen={false}
      >
        <ConcentrationEngine holdings={holdings} onSelect={setSelectedSym} />
      </SectionCard>

      {/* ── DOUBLE DOWN CANDIDATES ── */}
      <SectionCard
        icon={<Zap className="w-3.5 h-3.5" />}
        title="Double Down Candidates"
        summary="5 highest-conviction adds ranked vs WABAG template · tap to open dossier"
        badge="10 picks"
        badgeColor="var(--teal)"
        defaultOpen={false}
      >
        <DoubleDownPanel
          holdings={holdings}
          aiInsights={aiInsights}
          insightsData={insightsData}
          onSelect={setSelectedSym}
        />
      </SectionCard>

      {/* ── LADDER intro ── */}
      <SectionHeader
        title="Rebalance Ladder"
        subtitle={`Every position ranked by the conviction model. ${ladder.meta.total} active positions · ${ladder.excluded.length} strategic excluded.`}
      />

      {/* ── BUCKET HEALTH ── */}
      <SectionCard
        icon={<Activity className="w-3.5 h-3.5" />}
        title="Bucket Health"
        summary="avg conviction · action pulse · heroes & zeroes"
        defaultOpen={false}
      >
        <BucketDrift rows={allRows} />
      </SectionCard>

      {/* ── LADDER: 4 action sections — always visible, this is the core ── */}
      <section className="space-y-3">
        {ACTIONS.map(cfg => (
          <Section
            key={cfg.key}
            cfg={cfg}
            rows={ladder[cfg.key]}
            onSelect={setSelectedSym}
          />
        ))}
      </section>

      {/* ── DIMENSION HEATMAP ── */}
      <SectionCard
        icon={<LayoutGrid className="w-3.5 h-3.5" />}
        title="Dimension Heatmap"
        summary="36 × 10 conviction matrix — where each name scores"
        defaultOpen={false}
      >
        <DimensionHeatmap rows={allRows} />
      </SectionCard>

      {/* ── FOOTER: excluded positions ── */}
      <SectionCard
        icon={<Filter className="w-3.5 h-3.5" />}
        title="Strategic Exclusions"
        summary={`${ladder.excluded.length} positions — Hedge, Cash, Satellites`}
        defaultOpen={false}
      >
        <div className="flex gap-2 flex-wrap font-mono text-caption mb-2">
          {ladder.excluded.map(e => (
            <span key={e.sym} className="px-2 py-0.5 rounded border border-white/5 bg-white/2 text-zinc-500">
              {e.sym} <span className="text-zinc-600">· {e.bucket}</span>
            </span>
          ))}
        </div>
        <p className="text-meta text-text-dim leading-snug">
          Hedge, Cash, and Satellite positions excluded — insurance/strategic, not active capital allocation.
        </p>
      </SectionCard>

      <StockDossier
        sym={selectedSym}
        isOpen={selectedSym != null}
        onClose={() => setSelectedSym(null)}
        holdings={holdings}
        aiInsights={aiInsights}
        memory={memory}
        insightsData={insightsData}
        filingsData={filingsData}
        onRefreshThesis={onRefreshThesis}
        onPersistMemory={onPersistMemory}
      />
    </div>
  )
}
