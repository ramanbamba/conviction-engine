import { useState } from 'react'
import { Crosshair, Layers, Zap, ShieldAlert, FlaskConical } from 'lucide-react'
import screenerData from '../../data/screener.json'
import validationData from '../../data/screener-validation.json'
import SectionHeader from '../SectionHeader'
import SectionCard from '../SectionCard'
import { fN, fL } from '../../lib/format'

const PHASE_CLS = {
  markup: 'text-green', accumulation: 'text-teal', neutral: 'text-zinc-500', distribution: 'text-amber',
}

const CLASS_META = {
  BREAKOUT_READY: { label: 'READY', cls: 'text-green border-green/30 bg-green/10' },
  BASE_BUILDING:  { label: 'BASE',  cls: 'text-teal border-teal/30 bg-teal/10' },
  NEUTRAL:        { label: 'FLAT',  cls: 'text-zinc-400 border-white/15 bg-white/5' },
  DISTRESSED:     { label: 'AVOID', cls: 'text-red border-red/30 bg-red/10' },
}

/**
 * ScreenerTab — pre-breakout radar over the full Nifty 200 (held names included).
 * 12-signal weighted composite (coil near 52w highs, drying volume, quiet OBV
 * accumulation) fused with AlphaModel fundamentals grades; futures desk is
 * doctrine-gated (default NO, one bullet, never a basket). Renders only
 * src/data/screener.json — refresh via `npm run screener`.
 */
export default function ScreenerTab() {
  const data = screenerData
  const rows = data?.rows ?? []

  if (!rows.length) {
    return (
      <div className="tab-enter">
        <SectionHeader title="The Screener" subtitle="No scan yet — run npm run screener to hunt the Nifty 200 for pre-breakout coils." icon={Crosshair} />
      </div>
    )
  }

  const ready = rows.filter(r => r.class === 'BREAKOUT_READY')
  const base = rows.filter(r => r.class === 'BASE_BUILDING')
  const distressed = rows.filter(r => r.class === 'DISTRESSED')

  return (
    <div className="space-y-4 tab-enter select-none">
      <SectionHeader
        title="The Screener"
        subtitle="The rally before the rally: names coiling near 52-week highs on drying volume while OBV shows quiet accumulation — scored on 12 pre-breakout signals across the full Nifty 200, cross-checked against the AlphaModel. A hunting list to interrogate, not a buy list."
        icon={Crosshair}
        right={<span className="text-micro font-mono text-zinc-600">as of {data.asOf}</span>}
      />

      <FuturesDesk desk={data.futuresDesk} lotsLoaded={data.fnoLotsLoaded} regime={data.regime} validation={validationData} />

      <ProveItScorecard v={validationData} />

      {data.clusters?.length > 0 && (
        <div className="rounded-xl border border-teal/20 bg-teal/5 px-4 py-3 space-y-1">
          <div className="text-nano uppercase tracking-wider text-teal font-black flex items-center gap-1.5">
            <Layers className="w-3 h-3" /> Sector clustering — institutional rotation signal
          </div>
          <div className="text-caption text-zinc-400 leading-snug">
            {data.clusters.map(c => (
              <span key={c.industry} className="mr-3">
                <span className="text-white font-bold">{c.industry}</span>
                <span className="text-zinc-500 font-mono text-micro"> ({c.syms.join(', ')})</span>
              </span>
            ))}
          </div>
          <p className="text-micro text-zinc-600">3+ names from one industry coiling together usually means capital is rotating into the sector, not a stock-specific story.</p>
        </div>
      )}

      {/* ── Breakout ready ── */}
      <div className="space-y-1.5">
        <div className="text-nano uppercase tracking-wider text-green font-black">
          Breakout ready · {ready.length}
        </div>
        {ready.length === 0 && (
          <div className="text-caption text-zinc-600 italic py-2">Nothing is coiled right now — that's information too. Sit on hands.</div>
        )}
        {ready.map(r => <Row key={r.sym} r={r} />)}
      </div>

      <SectionCard icon={<Layers className="w-3.5 h-3.5" />} title="Base building" summary={`${base.length} names constructing a base — the next cycle's ready list`} defaultOpen={false}>
        <div className="space-y-1.5">
          {base.map(r => <Row key={r.sym} r={r} />)}
        </div>
      </SectionCard>

      <SectionCard icon={<ShieldAlert className="w-3.5 h-3.5" />} title="Distressed — do not catch" summary={`${distressed.length} names below the 200-day with momentum broken`} defaultOpen={false}>
        <div className="space-y-1.5">
          {distressed.map(r => <Row key={r.sym} r={r} />)}
        </div>
      </SectionCard>

      <div className="text-micro font-mono text-zinc-600 flex flex-wrap gap-x-4 gap-y-1">
        <span>Scanned {data.scanned} names ({data.failed} failed)</span>
        <span>READY {data.counts.ready} · BASE {data.counts.base} · FLAT {data.counts.neutral} · AVOID {data.counts.distressed}</span>
        <span>refresh: npm run screener</span>
      </div>
    </div>
  )
}

function FuturesDesk({ desk, lotsLoaded, regime, validation }) {
  if (!desk) return null
  const c = desk.candidate
  const standDown = desk.call === 'STAND_DOWN'
  // Graduated trust: forward tape EDGE → full budget; backtest EDGE → one lot; else paper.
  const forwardProven = validation?.verdict === 'EDGE'
  const backtestProven = validation?.backtest?.verdict === 'EDGE'
  const proven = forwardProven
  return (
    <div className={`rounded-xl border px-4 py-3.5 space-y-2 ${c ? 'border-green/30 bg-green/5' : standDown ? 'border-amber/25 bg-amber/5' : 'border-white/10 bg-white/2'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Zap className={`w-4 h-4 ${c ? 'text-green' : standDown ? 'text-amber' : 'text-zinc-500'}`} />
        <span className="text-caption font-black text-white uppercase tracking-wider">Futures Desk</span>
        <span className={`text-nano font-black uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono ${c ? 'text-green border-green/30 bg-green/10' : standDown ? 'text-amber border-amber/30 bg-amber/10' : 'text-zinc-400 border-white/15 bg-white/5'}`}>
          {c ? `ONE BULLET: ${c.sym}` : standDown ? 'STAND DOWN' : 'NO TRADE'}
        </span>
        {forwardProven ? null : backtestProven ? (
          <span className="text-nano font-black uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono text-amber border-amber/30 bg-amber/10">
            BACKTEST EDGE — live, 1 lot max
          </span>
        ) : (
          <span className="text-nano font-black uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono text-purple border-purple/30 bg-purple/10">
            PAPER TAPE — edge unproven
          </span>
        )}
        {regime?.nifty != null && (
          <span className="ml-auto text-micro font-mono text-zinc-500">
            Nifty {fN(Math.round(regime.nifty))} {regime.regime === 'RISK_ON' ? <span className="text-green">≥ 50dma</span> : <span className="text-red">&lt; 50dma</span>}
          </span>
        )}
      </div>

      {standDown ? (
        <p className="text-caption text-zinc-400 leading-snug">{desk.reason}</p>
      ) : c ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 font-mono text-micro">
            <Metric k="Setup score" v={`${c.score}/100`} />
            <Metric k="Entry (CMP)" v={`₹${fN(c.ltp)}`} />
            <Metric k="Stop (2×ATR)" v={`₹${fN(c.stop)}`} />
            <Metric k="Target (measured move)" v={`₹${fN(c.target)}`} />
            <Metric k="Reward : risk" v={`${c.rr}R`} />
            <Metric k="Catalyst (results)" v={c.catalystDate ? `${c.catalystDate} (T−${c.daysToCatalyst}d)` : '—'} />
            <Metric k="Time stop" v={`${c.timeStopSessions} sessions flat = exit`} />
            <Metric k="Daily ATR" v={`${c.atrPct}%`} />
            <Metric k="Lot size" v={fN(c.lot)} />
            <Metric k="Contract value" v={fL(c.contractValue)} />
            <Metric k="Margin est." v={fL(c.marginEst)} />
            <Metric k="Size (0.75% risk)" v={`${c.lots} lot${c.lots > 1 ? 's' : ''} · risk ${fL(c.riskPerLot * c.lots)}`} />
          </div>
          <p className="text-micro text-zinc-500 leading-snug">
            Cleared every gate: risk-on tape, top-shelf setup, survivable vol, leading sector, clean fundamentals{c.held ? ', already held with conviction' : ''}, dated results catalyst inside the contract window, and one lot fits the 0.75% risk budget.
            {forwardProven ? null : backtestProven
              ? <span className="text-amber font-bold"> Backtest-proven only — trade ONE lot regardless of budget headroom; the full 0.75% size unlocks when the forward tape confirms.</span>
              : <span className="text-purple font-bold"> Paper tape only — log it, don't lever it, until the Prove-It scorecard reads EDGE.</span>}
          </p>
        </>
      ) : (
        <p className="text-caption text-zinc-500 leading-snug">
          No name clears the bar today — which is the expected state. The tradebook says the 1–12 month window is where this book bleeds (₹4.18L lost trading it); leverage amplifies exactly that window. Every gate is machine-checked and fails closed: risk-on regime, setup ≥80, ATR ≤2.5%, leading sector, clean fundamentals, a dated results catalyst inside the contract window, and one lot inside the 0.75% risk budget{desk.riskBudget ? ` (${fL(desk.riskBudget)})` : ''}. Default answer: NO.
        </p>
      )}

      {desk.bench?.length > 0 && (
        <div className="pt-1.5 border-t border-white/5 space-y-1">
          <div className="text-nano uppercase tracking-wider text-zinc-600 font-black">Near the bar, gated out</div>
          {desk.bench.map(b => (
            <div key={b.sym} className="text-micro font-mono text-zinc-500">
              <span className="text-zinc-300 font-bold">{b.sym}</span> ({b.score}) — <span className="text-amber">{b.failedGates.join('; ')}</span>
            </div>
          ))}
        </div>
      )}
      {!lotsLoaded && <div className="text-micro text-amber">⚠ F&O lot data unavailable this scan — contract math suppressed.</div>}
    </div>
  )
}

const VERDICT_META = {
  EDGE:     { cls: 'text-green border-green/30 bg-green/10',  note: 'READY cohort has proven edge on our own tape — the desk may trade live capital, one bullet at a time.' },
  WEAK:     { cls: 'text-amber border-amber/30 bg-amber/10',  note: 'Positive expectancy but below the bar (55% hit, +0.15R). Keep papering — do not lever this yet.' },
  NO_EDGE:  { cls: 'text-red border-red/30 bg-red/10',        note: 'The pattern is NOT working on our tape. The desk stays dark regardless of how good a setup looks.' },
  UNPROVEN: { cls: 'text-purple border-purple/30 bg-purple/10', note: 'Not enough graded outcomes yet. Every scan snapshots the READY/BASE cohorts; grading needs ~30 sessions of forward tape.' },
}

function ProveItScorecard({ v }) {
  if (!v) return null
  const meta = VERDICT_META[v.verdict] ?? VERDICT_META.UNPROVEN
  const co = v.cohorts ?? {}
  return (
    <SectionCard
      icon={<FlaskConical className="w-3.5 h-3.5" />}
      title="Prove-It Scorecard"
      summary={`${v.verdict} · ${co.READY?.graded ?? 0}/${v.bar?.minGraded ?? 20} READY names graded`}
      badge={v.verdict}
      badgeColor={v.verdict === 'EDGE' ? 'var(--green)' : v.verdict === 'NO_EDGE' ? 'var(--red)' : undefined}
      defaultOpen={false}
    >
      <div className="space-y-2.5">
        <p className="text-caption text-zinc-500 leading-snug">
          The screener grades itself before it's allowed to touch leverage: every scan snapshots the READY and BASE cohorts, and each name is scored on whether it hit <span className="text-white font-bold">+1R before −1R within 30 sessions</span> (1R = 2×ATR). BASE is the control group — READY must beat it, not just the coin flip. Doctrine law #3: prove before you concentrate.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {['READY', 'BASE'].map(k => {
            const s = co[k]
            if (!s) return null
            return (
              <div key={k} className="rounded-lg border border-white/5 bg-dark/40 p-2.5 space-y-1 font-mono text-micro">
                <div className="text-nano uppercase tracking-wider text-zinc-600 font-black">{k === 'READY' ? 'READY (the strategy)' : 'BASE (control)'}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500">
                  <span>Graded <span className="text-zinc-200 font-bold">{s.graded}</span>/<span className="text-zinc-400">{s.tracked}</span></span>
                  <span>Hit <span className="text-zinc-200 font-bold">{s.hitRate != null ? `${Math.round(s.hitRate * 100)}%` : '—'}</span></span>
                  <span>Expectancy <span className={`font-bold ${(s.expectancy ?? 0) > 0 ? 'text-green' : s.expectancy != null ? 'text-red' : 'text-zinc-400'}`}>{s.expectancy != null ? `${s.expectancy > 0 ? '+' : ''}${s.expectancy}R` : '—'}</span></span>
                  <span className="text-zinc-600">W {s.wins} · L {s.losses} · T/O {s.timeouts} · open {s.open}</span>
                </div>
              </div>
            )
          })}
        </div>
        <p className={`text-micro leading-snug rounded border px-2 py-1.5 ${meta.cls}`}>{meta.note}</p>

        {v.backtest && (
          <div className="pt-2 border-t border-white/5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-nano uppercase tracking-wider text-zinc-500 font-black">Point-in-time backtest · 2y · {v.backtest.samples} samples</span>
              <span className={`text-nano font-black uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono ${(VERDICT_META[v.backtest.verdict] ?? VERDICT_META.UNPROVEN).cls}`}>{v.backtest.verdict}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-micro">
              {[['DESK_RISK_ON', 'Desk subset, risk-on (closest to live)'], ['READY', 'All READY'], ['BASE', 'BASE (control)'], ['READY_RISK_OFF', 'READY in risk-off (why the regime gate exists)']].map(([k, label]) => {
                const s = v.backtest.cohorts?.[k]
                if (!s) return null
                const exp = (x) => x != null ? `${x > 0 ? '+' : ''}${x}R` : '—'
                const expCls = (x) => (x ?? 0) > 0 ? 'text-green' : x != null ? 'text-red' : 'text-zinc-400'
                return (
                  <div key={k} className="rounded border border-white/5 bg-dark/40 px-2 py-1.5 space-y-0.5 text-zinc-500">
                    <div className="text-zinc-300 font-bold text-nano uppercase">{label} · n={s.n}</div>
                    <div className="flex flex-wrap gap-x-3">
                      <span>trade plan (2R/1R/15s) <span className={`font-bold ${expCls(s.plan?.expectancy)}`}>{exp(s.plan?.expectancy)}</span>/trade</span>
                      <span>hit <span className="text-zinc-200 font-bold">{s.plan?.hitRate != null ? `${Math.round(s.plan.hitRate * 100)}%` : '—'}</span></span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-zinc-600">
                      <span>±1R race: hit {s.race?.hitRate != null ? `${Math.round(s.race.hitRate * 100)}%` : '—'} · exp <span className={expCls(s.race?.expectancy)}>{exp(s.race?.expectancy)}</span></span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-micro text-zinc-600 leading-snug">{v.backtest.caveats} Backtest EDGE = license for one lot; the full risk budget waits for the forward tape.</p>
          </div>
        )}

        <p className="text-micro text-zinc-600 font-mono">Bar for EDGE: ≥{v.bar?.minGraded} graded · hit ≥{Math.round((v.bar?.minHitRate ?? 0.55) * 100)}% · expectancy ≥ +{v.bar?.minExpectancy}R · since {v.firstSnapshot ?? '—'} · grade via npm run screener:grade</p>
      </div>
    </SectionCard>
  )
}

function Metric({ k, v }) {
  return (
    <div>
      <div className="text-nano text-zinc-600 uppercase">{k}</div>
      <div className="text-zinc-200 font-bold">{v}</div>
    </div>
  )
}

function Row({ r }) {
  const [open, setOpen] = useState(false)
  const meta = CLASS_META[r.class] ?? CLASS_META.NEUTRAL
  const m = r.metrics
  return (
    <div className={`rounded-lg border ${r.fundamentals?.distressed ? 'border-red/20' : 'border-white/5'} bg-white/2 ${open ? 'bg-white/4' : ''}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 px-3 py-2 min-h-[44px] text-left cursor-pointer">
        <span className={`text-nano font-black uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono shrink-0 ${meta.cls}`}>{meta.label}</span>
        <span className="font-mono font-black text-white text-caption shrink-0">{r.sym}</span>
        {r.held && <span className="text-nano font-black text-purple border border-purple/30 bg-purple/10 rounded px-1 py-0.5 shrink-0">HELD</span>}
        {r.fnoLot && <span className="text-nano font-bold text-zinc-500 border border-white/10 rounded px-1 py-0.5 shrink-0">F&O</span>}
        <span className="text-micro text-zinc-600 font-mono truncate hidden sm:inline">{r.industry}</span>
        <span className="ml-auto flex items-center gap-3 font-mono text-micro shrink-0">
          {r.fundamentals?.distressed && <span className="text-red">⚠</span>}
          <span className="text-zinc-500">₹{fN(Math.round(m.ltp))}</span>
          <span className={`hidden sm:inline ${PHASE_CLS[r.sectorPhase] ?? 'text-zinc-500'}`}>{r.sectorPhase}</span>
          <span className="font-black text-white">{r.score}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0.5 space-y-2.5 text-micro font-mono">
          <div className="text-zinc-500">{r.name}</div>

          {/* 12 signal chips */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {r.signals.map(s => (
              <div key={s.id} className={`rounded border px-2 py-1 ${s.pass ? 'border-green/25 bg-green/5' : 'border-white/5 bg-white/2 opacity-60'}`}>
                <div className={`text-nano font-bold ${s.pass ? 'text-green' : 'text-zinc-500'}`}>{s.pass ? '●' : '○'} {s.label} <span className="text-zinc-600">+{s.weight}</span></div>
                <div className="text-nano text-zinc-500">{s.detail}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500">
            <span>RSI <span className="text-zinc-300 font-bold">{m.rsi14 ?? '—'}</span></span>
            <span>From 52wH <span className="text-zinc-300 font-bold">{m.fromHighPct}%</span></span>
            <span>ATR <span className="text-zinc-300 font-bold">{m.atrPct ?? '—'}%</span></span>
            <span>20d coil <span className="text-zinc-300 font-bold">{m.band20Pct ?? '—'}%</span></span>
            <span>3mo <span className={`font-bold ${(m.ret60Pct ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>{m.ret60Pct != null ? `${m.ret60Pct > 0 ? '+' : ''}${m.ret60Pct}%` : '—'}</span></span>
            {r.fnoLot && <span>Lot <span className="text-zinc-300 font-bold">{fN(r.fnoLot)}</span></span>}
          </div>

          {r.fundamentals ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500">
              <span>AlphaModel <span className="text-zinc-300 font-bold">{r.fundamentals.modelScore ?? '—'} ({r.fundamentals.modelTier ?? '—'})</span></span>
              <span>Grade <span className="text-zinc-300 font-bold">{r.fundamentals.grade ?? '—'}</span></span>
              {r.fundamentals.pledge != null && <span>Pledge <span className={r.fundamentals.pledge > 10 ? 'text-amber font-bold' : 'text-zinc-300'}>{r.fundamentals.pledge}%</span></span>}
              {r.fundamentals.redFlags?.length > 0 && <span className="text-amber">⚑ {r.fundamentals.redFlags.join(' · ')}</span>}
              {r.fundamentals.distressed && <span className="text-red">⚠ structural distress — technicals lie here</span>}
            </div>
          ) : r.held ? (
            <div className="text-zinc-600 italic">Held position — full fundamentals live in the dossier (Portfolio tab).</div>
          ) : (
            <div className="text-zinc-600 italic">Fundamentals not yet graded — interrogate before any add (technicals alone can flag landmines).</div>
          )}
        </div>
      )}
    </div>
  )
}
