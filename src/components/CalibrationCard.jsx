import { useMemo } from 'react'
import { Crosshair } from 'lucide-react'
import memoryData from '../data/memory.json'
import fundamentalsData from '../data/fundamentals.json'
import insightsData from '../data/insights.json'
import aiInsightsData from '../data/ai-insights.json'
import { convictionCalibration, pmRecord } from '../lib/calibration'
import { rankBook } from '../lib/alphaModel'

const pct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const retCls = v => v == null ? 'text-zinc-500' : v > 0 ? 'text-green' : 'text-red'

/**
 * CalibrationCard — the mirror. Does stated conviction match realized outcome,
 * and who's right when you and the PM disagree? Computed live from the book +
 * the graded supervision ledger. The feature no broker will ever show you.
 */
export default function CalibrationCard({ holdings = [] }) {
  const { tiers, mismatches } = useMemo(() => convictionCalibration(holdings), [holdings])
  const rec = useMemo(() => pmRecord(memoryData.pmLedger || []), [])
  // Machine vs human — where the alpha model and your conviction disagree ≥2 notches.
  // This list is the learning agenda: one of you is wrong, and finding out which is alpha.
  const divergences = useMemo(() =>
    rankBook(holdings, fundamentalsData, insightsData, aiInsightsData)
      .filter(r => r.conv != null && ((r.model.score >= 70 && r.conv < 6) || (r.model.score < 40 && r.conv >= 7)))
      .slice(0, 4),
  [holdings])
  if (!tiers.some(t => t.n > 0)) return null

  const high = tiers[0], rest = tiers.slice(1).filter(t => t.n > 0)
  const calibrated = high.avgRet != null && rest.every(t => t.avgRet == null || high.avgRet > t.avgRet)

  return (
    <section className="rounded-xl border border-white/10 bg-white/2 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-green" />
          <div>
            <div className="text-meta uppercase tracking-wider text-zinc-400 font-black">Calibration</div>
            <div className="text-nano text-zinc-600">conviction vs realized outcome · live book</div>
          </div>
        </div>
        {/* conviction tiers */}
        <div className="flex items-center gap-4 font-mono text-caption">
          {tiers.filter(t => t.n > 0).map(t => (
            <div key={t.key} className="text-right">
              <div className="text-nano text-zinc-600 uppercase">conv {t.label}</div>
              <div className={`font-black ${retCls(t.avgRet)}`}>{pct(t.avgRet)} <span className="text-zinc-600 font-normal">n={t.n}</span></div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-caption text-zinc-400 leading-snug">
        {calibrated
          ? <>Your high-conviction tier is earning its score — the edge is real. The leak is below it: mid/low-conviction names drag, so size up the 8s and starve the rest.</>
          : <>Warning — a lower tier is outperforming your 8–10s. Your confidence is mispriced; re-score before sizing up.</>}
      </p>

      {mismatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
          <span className="text-nano uppercase tracking-wider text-amber font-black">Mispriced conviction</span>
          {mismatches.map(m => (
            <span key={m.sym} className="text-micro font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-zinc-300">
              {m.sym} <span className="text-zinc-500">conv {m.conv}</span> <span className={retCls(m.ret)}>{pct(m.ret)}</span>
            </span>
          ))}
        </div>
      )}

      {divergences.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
          <span className="text-nano uppercase tracking-wider text-teal font-black" title="Where the alpha model and your conviction disagree by ≥2 notches — the learning agenda">Machine vs you</span>
          {divergences.map(d => (
            <span key={d.sym} className="text-micro font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-zinc-300" title={`driver ${d.model.driver} · risk ${d.model.risk}`}>
              {d.sym} <span className={d.model.score >= 70 ? 'text-green' : 'text-red'}>α {d.model.score}</span> <span className="text-zinc-600">vs</span> <span className="text-zinc-400">conv {d.conv}</span>
            </span>
          ))}
        </div>
      )}

      <div className="text-micro font-mono text-zinc-500 pt-1 border-t border-white/5">
        PM record: <span className="text-zinc-300">{rec.ratified} ratified</span> · <span className="text-zinc-300">{rec.vetoed} vetoed</span> · {rec.pending} pending
        {rec.pm.graded > 0
          ? <> — PM right <span className="text-green">{rec.pm.right}/{rec.pm.graded}</span>{rec.you.graded > 0 && <> · your overrides right <span className="text-green">{rec.you.right}/{rec.you.graded}</span></>}</>
          : <> — outcome grading begins T+30 after each call</>}
      </div>
    </section>
  )
}
