import { useMemo } from 'react'
import rearview from '../../data/rearview.json'

/**
 * RearviewTab — the Investor Report Card.
 *
 * A dedicated, story-driven autopsy of 4.9 years of real trading: where the
 * money was actually made, which habits bled it back, and the rules that follow.
 * The single biggest leverage point — learning from your own tape.
 */

const L = n => `${n < 0 ? '-' : ''}₹${(Math.abs(n) / 1e5).toFixed(2)}L`
const Cr = n => `₹${(n / 1e7).toFixed(2)}Cr`

function Stat({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-3">
      <div className="text-nano text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-heading font-black leading-none mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-nano text-zinc-600 font-mono mt-1">{sub}</div>}
    </div>
  )
}

export default function RearviewTab() {
  const r = rearview
  if (!r?.span) return <div className="text-zinc-500 text-caption p-6">No tradebook data. Drop Zerodha exports in data/tradebook/ and run <code>npm run rearview</code>.</div>

  const { span, activity, realized, costDrag, holdingPeriods, trajectory, biggestWins, biggestLosses, roundTrippers, rules, concentration, stockLedger = [], counterfactuals = [], whatIfHeld } = r

  // Hold-period P&L bar scaling
  const maxAbs = useMemo(() => Math.max(...holdingPeriods.buckets.map(b => Math.abs(b.pnl)), 1), [holdingPeriods])
  const longBucket = holdingPeriods.buckets.find(b => b.label === '> 1 year')
  const tradeWindow = holdingPeriods.buckets.filter(b => ['1–3 mo', '3–12 mo'].includes(b.label)).reduce((a, b) => a + b.pnl, 0)

  const maxFY = useMemo(() => Math.max(...trajectory.map(t => Math.abs(t.pnl)), 1), [trajectory])

  return (
    <div className="space-y-8 tab-enter select-none">

      {/* ── HERO VERDICT ── */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-5 space-y-3">
        <div className="text-meta text-zinc-500 uppercase tracking-wider">Investor Report Card · {span.firstTrade} → {span.lastTrade} · {span.years}y</div>
        <h2 className="text-hero font-black text-white leading-tight">You're an investor who loses money trading.</h2>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-xl border border-green/20 bg-green/5 p-3">
            <div className="text-nano text-green uppercase tracking-wider">Holding &gt; 1 year</div>
            <div className="font-mono text-hero font-black text-green leading-none mt-1">+{L(longBucket?.pnl || 0).replace('₹','₹')}</div>
            <div className="text-nano text-zinc-500 mt-1">{longBucket?.winRate}% win · {longBucket?.avgPct}% avg</div>
          </div>
          <div className="rounded-xl border border-red/20 bg-red/5 p-3">
            <div className="text-nano text-red uppercase tracking-wider">Trading 1–12 months</div>
            <div className="font-mono text-hero font-black text-red leading-none mt-1">{L(tradeWindow)}</div>
            <div className="text-nano text-zinc-500 mt-1">the churn window — pure bleed</div>
          </div>
        </div>
        <p className="text-caption text-zinc-400 leading-relaxed">
          Net realized over {span.years} years: <span className={realized.totalPnL >= 0 ? 'text-green' : 'text-red'}>{L(realized.totalPnL)}</span> on
          {' '}{Cr(activity.turnover)} of turnover. The wealth is in what you held — the trading is noise that pays a toll.
        </p>
      </section>

      {/* ── LIFETIME SCORECARD ── */}
      <section className="space-y-3">
        <h3 className="text-body font-black text-white">Lifetime Scorecard</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Realized P&L" value={L(realized.totalPnL)} color={realized.totalPnL >= 0 ? 'text-green' : 'text-red'} sub={`${realized.roundTrips} round-trips`} />
          <Stat label="Profit factor" value={realized.profitFactor} color={realized.profitFactor >= 1.5 ? 'text-green' : realized.profitFactor >= 1 ? 'text-amber' : 'text-red'} sub="gross win ÷ gross loss" />
          <Stat label="Win rate" value={`${realized.winRate}%`} color={realized.winRate >= 50 ? 'text-green' : 'text-amber'} sub={`${realized.wins}W / ${realized.losses}L`} />
          <Stat label="Expectancy" value={`₹${realized.expectancy}`} color={realized.expectancy >= 0 ? 'text-zinc-200' : 'text-red'} sub="avg ₹ per round-trip" />
          <Stat label="Turnover" value={Cr(activity.turnover)} color="text-zinc-300" sub={`${activity.tradesPerMonth} trades/mo`} />
          <Stat label="Cost drag (est)" value={L(costDrag.estimated)} color="text-amber" sub={`${costDrag.pctOfNet}% of net profit`} />
        </div>
      </section>

      {/* ── TRADER vs INVESTOR (the proof) ── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-body font-black text-white">Where the money is actually made</h3>
          <p className="text-caption text-zinc-500 leading-snug mt-0.5">Win rate and realized P&L by holding period. The longer you hold, the better you do.</p>
        </div>
        <div className="space-y-2">
          {holdingPeriods.buckets.map(b => {
            const pos = b.pnl >= 0
            const w = Math.abs(b.pnl) / maxAbs * 100
            return (
              <div key={b.label} className="flex items-center gap-3">
                <div className="w-20 shrink-0 text-caption font-mono text-zinc-400">{b.label}</div>
                <div className="w-14 shrink-0 text-caption font-mono text-right">
                  <span className={b.winRate >= 50 ? 'text-green' : 'text-zinc-500'}>{b.winRate}%</span>
                </div>
                <div className="flex-1 relative h-5 flex items-center">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
                  <div
                    className={`absolute h-3 rounded ${pos ? 'bg-green/60' : 'bg-red/60'}`}
                    style={{ width: `${w / 2}%`, [pos ? 'left' : 'right']: '50%' }}
                  />
                </div>
                <div className={`w-16 shrink-0 text-caption font-mono text-right ${pos ? 'text-green' : 'text-red'}`}>{L(b.pnl)}</div>
                <div className="w-12 shrink-0 text-nano font-mono text-zinc-600 text-right">{b.trades}</div>
              </div>
            )
          })}
        </div>
        <p className="text-nano text-zinc-600 font-mono">columns: hold period · win rate · ←loss | gain→ · realized P&L · # trips</p>
      </section>

      {/* ── IMPROVEMENT TRAJECTORY ── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-body font-black text-white">Are you learning?</h3>
          <p className="text-caption text-zinc-500 leading-snug mt-0.5">Realized P&L, win rate, and activity by financial year.</p>
        </div>
        <div className="space-y-2">
          {trajectory.map(t => {
            const pos = t.pnl >= 0
            const w = Math.abs(t.pnl) / maxFY * 100
            return (
              <div key={t.fy} className="flex items-center gap-3">
                <div className="w-14 shrink-0 text-caption font-mono text-zinc-400">{t.fy}</div>
                <div className="flex-1 h-5 flex items-center">
                  <div className={`h-3 rounded ${pos ? 'bg-green/60' : 'bg-red/60'}`} style={{ width: `${w}%` }} />
                  <span className={`ml-2 text-caption font-mono ${pos ? 'text-green' : 'text-red'}`}>{L(t.pnl)}</span>
                </div>
                <div className="w-32 shrink-0 text-nano font-mono text-zinc-600 text-right">
                  {t.trades} trips · {t.winRate}% · {t.avgHoldDays}d
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── COUNTERFACTUALS: what selling cost you ── */}
      {counterfactuals.length > 0 && whatIfHeld && (() => {
        const missed = counterfactuals.filter(c => c.leftOnTable > 0).slice(0, 5)
        const saved = counterfactuals.filter(c => c.leftOnTable < 0).slice(-5).reverse()
        const net = whatIfHeld.totalLeftOnTable
        return (
          <section className="space-y-3">
            <div>
              <h3 className="text-body font-black text-white">What selling cost you</h3>
              <p className="text-caption text-zinc-500 leading-snug mt-0.5">
                Where your {whatIfHeld.pricedExits} biggest exits trade today vs your exit price.
                {' '}Net: holding instead would have been{' '}
                <span className={net > 0 ? 'text-red' : 'text-green'}>{net > 0 ? `${L(net)} better` : `${L(-net)} worse`}</span>
                {Math.abs(net) < 200000 && ' — your exit direction was roughly a wash. The damage was trading volume, not timing.'}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="text-nano text-red uppercase tracking-wider">Should've held</div>
                {missed.map(c => (
                  <div key={c.symbol} className="rounded-lg border border-white/5 bg-white/2 p-2.5 flex items-center justify-between gap-2 font-mono">
                    <div className="min-w-0">
                      <span className="font-black text-white text-caption">{c.symbol}</span>
                      <span className="text-nano text-zinc-600 ml-2">₹{c.avgExit} → ₹{c.now}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-red text-caption font-bold">{L(c.leftOnTable)}</div>
                      <div className="text-nano text-zinc-600">+{c.sinceExitPct}% since</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="text-nano text-green uppercase tracking-wider">Good exits (dodged the drop)</div>
                {saved.map(c => (
                  <div key={c.symbol} className="rounded-lg border border-white/5 bg-white/2 p-2.5 flex items-center justify-between gap-2 font-mono">
                    <div className="min-w-0">
                      <span className="font-black text-white text-caption">{c.symbol}</span>
                      <span className="text-nano text-zinc-600 ml-2">₹{c.avgExit} → ₹{c.now}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-green text-caption font-bold">{L(-c.leftOnTable)}</div>
                      <div className="text-nano text-zinc-600">{c.sinceExitPct}% since</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-nano text-zinc-600 leading-relaxed">
              {whatIfHeld.pricedExits} priced exits (current Kite LTP). Not adjusted for post-exit bonuses/splits — a few (e.g. RELIANCE 1:1 bonus) overstate the "saved" side.
            </p>
          </section>
        )
      })()}

      {/* ── P&L BY STOCK (consolidated) ── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-body font-black text-white">P&L by stock</h3>
          <p className="text-caption text-zinc-500 leading-snug mt-0.5">
            Every trade in a name consolidated into one line.
            {concentration && ` ${concentration.profitableStocks} winners / ${concentration.losingStocks} losers — your 5 worst names are ${concentration.top5LosersPctOfGrossLoss}% of all losses.`}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 border-b border-white/10 bg-white/3 text-nano text-zinc-500 uppercase tracking-wider font-mono">
            <span>Stock</span><span className="text-right">Realized</span><span className="text-right w-16">Trips · Win</span><span className="text-right w-12">Hold</span>
          </div>
          <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-white/5">
            {stockLedger.map(s => {
              const pos = s.pnl >= 0
              const churned = s.trips >= 20
              return (
                <div key={s.symbol} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-1.5 font-mono text-caption items-center">
                  <span className="text-white truncate flex items-center gap-1.5">
                    {s.symbol}
                    {s.stillHeld && <span className="text-nano text-teal">held</span>}
                  </span>
                  <span className={`text-right ${pos ? 'text-green' : 'text-red'}`}>{L(s.pnl)}</span>
                  <span className={`text-right w-16 ${churned ? 'text-amber' : 'text-zinc-500'}`}>{s.trips}× · {s.winRate}%</span>
                  <span className="text-right w-12 text-zinc-600">{s.avgHoldDays}d</span>
                </div>
              )
            })}
          </div>
        </div>
        <p className="text-nano text-zinc-600 font-mono">amber trip count = 20+ round-trips on one name (overtrading)</p>
      </section>

      {/* ── BIGGEST DECISIONS ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-body font-black text-green">Best decisions</h3>
          {biggestWins.slice(0, 5).map((l, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/2 p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono font-black text-white text-caption">{l.symbol}</span>
                <span className="text-nano text-zinc-600 font-mono ml-2">{l.holdDays}d hold</span>
              </div>
              <div className="text-right shrink-0 font-mono">
                <div className="text-green text-caption font-bold">{L(l.pnl)}</div>
                <div className="text-nano text-zinc-600">+{l.pnlPct}%</div>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <h3 className="text-body font-black text-red">Worst decisions</h3>
          {biggestLosses.slice(0, 5).map((l, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/2 p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono font-black text-white text-caption">{l.symbol}</span>
                <span className="text-nano text-zinc-600 font-mono ml-2">{l.holdDays}d hold</span>
              </div>
              <div className="text-right shrink-0 font-mono">
                <div className="text-red text-caption font-bold">{L(l.pnl)}</div>
                <div className="text-nano text-zinc-600">{l.pnlPct}%</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── INDECISION TAX ── */}
      {roundTrippers?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-body font-black text-white">The indecision tax</h3>
          <p className="text-caption text-zinc-500 leading-snug">Names you bought, sold, and re-bought — often re-entering your own winners higher.</p>
          <div className="flex flex-wrap gap-1.5 font-mono text-caption pt-1">
            {roundTrippers.map(s => (
              <span key={s.symbol} className="rounded-full border border-amber/20 bg-amber/5 text-amber px-2.5 py-0.5">
                {s.symbol} <span className="text-zinc-500">{s.entries}×</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── YOUR RULES ── */}
      {rules?.length > 0 && (
        <section className="space-y-3 border-t border-white/10 pt-6">
          <h3 className="text-body font-black text-white">Your rules — written by your own tape</h3>
          <div className="space-y-2">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-teal/20 bg-teal/5 p-3">
                <span className="text-teal font-black shrink-0">{i + 1}</span>
                <p className="text-caption text-zinc-300 leading-relaxed">{rule}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-nano text-zinc-600 leading-relaxed">
        FIFO-matched realized round-trips · {span.firstTrade} → {span.lastTrade}. Excludes unrealized gains in the current book
        and pre-{span.firstTrade.slice(0, 4)} cost basis ({r.oversoldShares} oversold shares from bonus/pre-history). Cost drag is an estimate ({costDrag.assumptions}).
      </p>
    </div>
  )
}
