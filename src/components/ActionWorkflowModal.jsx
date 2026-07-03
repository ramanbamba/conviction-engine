import { useState, useMemo, useEffect, useRef } from 'react'
import { X, AlertTriangle, CheckCircle, ExternalLink, ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react'
import { fL, fR, fP } from '../lib/format'

// ── Anti-pattern detection ───────────────────────────────────────────────────

function detectAntiPatterns(holding, action, newWeight, newQty, newAvg) {
  const warnings = []
  if (!holding) return warnings

  // inverse_sizing: adding to low-conviction stock that would cross 5% weight
  if (holding.conv < 6 && newWeight > 5) {
    warnings.push({
      pattern: 'inverse_sizing',
      severity: 'red',
      label: 'Inverse Sizing',
      detail: `Conv ${holding.conv}/10 — adding here puts a low-conviction name at ${newWeight.toFixed(1)}% weight. Your documented #1 mistake.`,
    })
  }

  // pa_to_lt_conversion: Power Alpha stock past -8% SL
  if (holding.bucket === 'Power Alpha' && holding.pnlPct < -0.08) {
    warnings.push({
      pattern: 'pa_to_lt_conversion',
      severity: 'red',
      label: 'PA→LT Conversion Risk',
      detail: `${holding.sym} is ${fP(holding.pnlPct)} past the -8% PA hard stop. Adding converts a failed trade into a long-term hold — your documented pattern.`,
    })
  }

  // SL breach: any stock past its stop
  if (holding.sl && holding.ltp < holding.sl && holding.bucket !== 'Power Alpha') {
    warnings.push({
      pattern: 'sl_breach',
      severity: 'amber',
      label: 'Below Stop-Loss',
      detail: `SL ₹${holding.sl} — current ₹${fR(holding.ltp)}. Thesis reassessment needed before adding.`,
    })
  }

  return warnings
}

// ── Step components ──────────────────────────────────────────────────────────

function StepPreview({ action, holding, bucketVal, bucketTarget, totalVal, onNext, onClose, onBypass }) {
  const [qty,         setQty]         = useState(holding?.addQty > 0 ? String(holding.addQty) : '')
  const [price,       setPrice]       = useState(holding?.ltp ? String(holding.ltp.toFixed(2)) : '')
  const [acceptInput, setAcceptInput] = useState('')

  const qtyNum   = parseFloat(qty)   || 0
  const priceNum = parseFloat(price) || 0

  const impact = useMemo(() => {
    if (!qtyNum || !priceNum || !holding) return null
    const cost       = qtyNum * priceNum
    const newQty     = holding.qty + qtyNum
    const newAvg     = (holding.qty * holding.avg + cost) / newQty
    const newValue   = newQty * holding.ltp
    const newWeight  = (newValue / (totalVal + cost)) * 100
    const oldWeight  = (holding.value / totalVal) * 100
    const newBktFill = ((bucketVal + cost) / (bucketTarget || 1)) * 100
    const oldBktFill = (bucketVal / (bucketTarget || 1)) * 100
    const warnings   = detectAntiPatterns(holding, action, newWeight, newQty, newAvg)

    return { cost, newAvg, newWeight, oldWeight, newBktFill, oldBktFill, warnings }
  }, [qtyNum, priceNum, holding, totalVal, bucketVal, bucketTarget, action])

  const redWarnings = impact?.warnings?.filter(w => w.severity === 'red') || []
  const hasRedGate  = redWarnings.length > 0
  const gateCleared = !hasRedGate || acceptInput.trim().toLowerCase() === 'i accept'
  const canProceed  = qtyNum > 0 && priceNum > 0 && gateCleared

  return (
    <div className="space-y-5">
      {/* Action context */}
      <div className="bg-dark/60 border border-white/8 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-meta font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white">
            {action.tag}
          </span>
          <span className="font-bold text-white text-sm">{action.stock}</span>
          {holding && (
            <span className="text-meta text-text-dim ml-auto">{holding.bucket}</span>
          )}
        </div>
        <p className="text-xs text-text-sec leading-relaxed">{action.action}</p>
      </div>

      {/* Qty + Price inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-meta text-text-dim uppercase tracking-wider font-bold block mb-1.5">
            Quantity (shares)
          </label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder="e.g. 100"
            className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-text-dim focus:outline-none focus:border-zinc-700 transition-colors"
            autoFocus
          />
        </div>
        <div>
          <label className="text-meta text-text-dim uppercase tracking-wider font-bold block mb-1.5">
            Price (₹)
          </label>
          <input
            type="number"
            min="0"
            step="0.05"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder={holding?.ltp ? String(holding.ltp.toFixed(2)) : '0.00'}
            className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-text-dim focus:outline-none focus:border-zinc-700 transition-colors"
          />
          {holding?.ltp && (
            <button
              type="button"
              onClick={() => setPrice(String(holding.ltp.toFixed(2)))}
              className="text-meta text-zinc-400 hover:text-white mt-1 cursor-pointer transition-colors"
            >
              Use LTP ₹{fR(holding.ltp)}
            </button>
          )}
        </div>
      </div>

      {/* Impact preview */}
      {impact && (
        <div className="bg-dark/40 border border-white/8 rounded-xl divide-y divide-white/5">
          <div className="px-4 py-2 flex justify-between items-center">
            <span className="text-meta text-text-dim">Estimated cost</span>
            <span className="font-mono text-sm font-bold text-white">{fL(impact.cost)}</span>
          </div>
          {holding && (
            <>
              <div className="px-4 py-2 flex justify-between items-center">
                <span className="text-meta text-text-dim">Current position</span>
                <span className="text-xs text-text-sec">{holding.qty} sh @ {fR(holding.avg)}</span>
              </div>
              <div className="px-4 py-2 flex justify-between items-center">
                <span className="text-meta text-text-dim">Post-buy avg</span>
                <span className="font-mono text-xs font-bold text-white">
                  {fR(impact.newAvg)}
                  <span className={`ml-1.5 text-meta ${impact.newAvg < holding.avg ? 'text-green' : 'text-amber'}`}>
                    ({impact.newAvg < holding.avg ? '▼' : '▲'} {fR(Math.abs(impact.newAvg - holding.avg))})
                  </span>
                </span>
              </div>
              <div className="px-4 py-2 flex justify-between items-center">
                <span className="text-meta text-text-dim">Portfolio weight</span>
                <span className="text-xs font-mono text-text-sec">
                  {impact.oldWeight.toFixed(1)}%
                  <span className="text-text-dim mx-1">→</span>
                  <span className={impact.newWeight > 10 ? 'text-amber font-bold' : 'text-white font-bold'}>
                    {impact.newWeight.toFixed(1)}%
                  </span>
                </span>
              </div>
              {bucketTarget > 0 && (
                <div className="px-4 py-2 flex justify-between items-center">
                  <span className="text-meta text-text-dim">Bucket fill ({holding.bucket})</span>
                  <span className="text-xs font-mono text-text-sec">
                    {impact.oldBktFill.toFixed(0)}%
                    <span className="text-text-dim mx-1">→</span>
                    <span className="text-white font-bold">{Math.min(impact.newBktFill, 999).toFixed(0)}%</span>
                  </span>
                </div>
              )}
              <div className="px-4 py-2 flex justify-between items-center">
                <span className="text-meta text-text-dim">Conviction</span>
                <span className={`text-xs font-bold ${
                  holding.conv >= 8 ? 'text-green' : holding.conv >= 6 ? 'text-amber' : 'text-red'
                }`}>
                  {holding.conv}/10 {holding.conv >= 8 ? '✓ Strong Buy' : holding.conv >= 6 ? 'Hold' : '⚠ Low'}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Anti-pattern warnings */}
      {impact?.warnings?.map((w, i) => (
        <div key={i} className={`border rounded-xl px-4 py-3 flex gap-3 ${
          w.severity === 'red' ? 'bg-red/8 border-red/25' : 'bg-amber/8 border-amber/25'
        }`}>
          <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${w.severity === 'red' ? 'text-red' : 'text-amber'}`} />
          <div>
            <div className={`text-xs font-bold mb-0.5 ${w.severity === 'red' ? 'text-red' : 'text-amber'}`}>
              {w.label}
            </div>
            <p className="text-xs text-text-sec leading-relaxed">{w.detail}</p>
          </div>
        </div>
      ))}

      {/* B1: Typed acknowledgment gate — required for red anti-patterns */}
      {hasRedGate && (
        <div className="bg-red/5 border border-red/30 rounded-xl px-4 py-3 space-y-2">
          <p className="text-meta text-red font-bold uppercase tracking-wider">
            Override confirmation required
          </p>
          <p className="text-meta text-text-sec leading-relaxed">
            You are about to override a documented anti-pattern. Type{' '}
            <strong className="text-white font-mono">I accept</strong>{' '}
            to acknowledge the risk and proceed.
          </p>
          <input
            type="text"
            value={acceptInput}
            onChange={e => setAcceptInput(e.target.value)}
            placeholder='Type "I accept"'
            className="w-full bg-deep border border-red/30 focus:border-red rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-text-dim focus:outline-none transition-colors"
          />
        </div>
      )}

      {/* No holding found */}
      {!holding && (
        <div className="bg-amber/8 border border-amber/25 rounded-xl px-4 py-3 text-xs text-amber">
          Stock not found in current holdings — this would be a new position.
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="w-1/3 border border-white/10 bg-transparent hover:bg-white/5 text-text-sec hover:text-white transition-all font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (hasRedGate) onBypass?.(redWarnings.map(w => w.pattern))
            onNext({ qty: qtyNum, price: priceNum })
          }}
          disabled={!canProceed}
          className="flex-1 bg-zinc-800 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2"
        >
          Open in Kite <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function StepExecute({ action, qty, price, onNext, onBack }) {
  const kiteSym = (action.stock || '').replace(/[^A-Z0-9&]/gi, '')

  return (
    <div className="space-y-5">
      <div className="bg-dark/60 border border-white/8 rounded-xl p-5 space-y-4">
        <div className="text-meta text-text-dim uppercase tracking-wider font-bold">Order details</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-meta text-text-dim mb-1">Stock</div>
            <div className="font-mono font-bold text-white text-sm">{action.stock}</div>
          </div>
          <div>
            <div className="text-meta text-text-dim mb-1">Quantity</div>
            <div className="font-mono font-bold text-white text-sm">{qty} sh</div>
          </div>
          <div>
            <div className="text-meta text-text-dim mb-1">Price</div>
            <div className="font-mono font-bold text-white text-sm">{fR(price)}</div>
          </div>
        </div>
        <div className="pt-3 border-t border-white/5">
          <div className="text-meta text-text-dim mb-1">Estimated value</div>
          <div className="font-mono font-extrabold text-white text-base">{fL(qty * price)}</div>
        </div>
      </div>

      <a
        href="https://kite.zerodha.com"
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-zinc-800 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold py-3 rounded-xl text-sm transition-all"
      >
        Open Zerodha Kite <ExternalLink className="w-4 h-4" />
      </a>

      <p className="text-meta text-text-dim text-center leading-relaxed">
        Search <strong className="text-text-sec">{kiteSym}</strong> in Kite, place a{' '}
        <strong className="text-text-sec">CNC limit order</strong> for{' '}
        <strong className="text-text-sec">{qty} shares @ {fR(price)}</strong>, then return here.
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-1/3 border border-white/10 bg-transparent hover:bg-white/5 text-text-sec hover:text-white transition-all font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 bg-green hover:bg-green/90 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2"
        >
          Order placed — confirm <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function StepConfirm({ action, qty, price, onSubmit, onBack }) {
  const [filledQty,   setFilledQty]   = useState(String(qty))
  const [filledPrice, setFilledPrice] = useState(String(price.toFixed(2)))
  const [thesis,      setThesis]      = useState('')
  const [error,       setError]       = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (thesis.trim().length < 10) {
      setError('Write at least one sentence — why did you execute this?')
      return
    }
    onSubmit({
      filledQty:   parseFloat(filledQty)   || qty,
      filledPrice: parseFloat(filledPrice) || price,
      thesis: thesis.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-meta text-text-dim uppercase tracking-wider font-bold block mb-1.5">
            Filled qty
          </label>
          <input
            type="number"
            value={filledQty}
            onChange={e => setFilledQty(e.target.value)}
            className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-green transition-colors"
          />
        </div>
        <div>
          <label className="text-meta text-text-dim uppercase tracking-wider font-bold block mb-1.5">
            Filled price (₹)
          </label>
          <input
            type="number"
            step="0.05"
            value={filledPrice}
            onChange={e => setFilledPrice(e.target.value)}
            className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-green transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="text-meta text-text-dim uppercase tracking-wider font-bold block mb-1.5">
          Thesis — why are you executing this? (required)
        </label>
        <textarea
          value={thesis}
          onChange={e => { setThesis(e.target.value); setError('') }}
          rows={3}
          placeholder="e.g. Closing Platinum gap on conviction-8.8 name pre-Q4. RoA re-rating thesis intact, geopolitically immune."
          className="w-full bg-deep border border-white/10 rounded-xl px-3 py-3 text-xs text-white placeholder-text-dim focus:outline-none focus:border-green transition-colors resize-none leading-relaxed"
          autoFocus
        />
        {error && (
          <p className="text-meta text-red flex items-center gap-1.5 mt-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-1/3 border border-white/10 bg-transparent hover:bg-white/5 text-text-sec hover:text-white transition-all font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <button
          type="submit"
          className="flex-1 bg-green hover:bg-green/90 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
        >
          <CheckCircle className="w-3.5 h-3.5" /> Save & close loop
        </button>
      </div>
    </form>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────

const STEP_TITLES = {
  preview: 'Preview Impact',
  execute: 'Execute in Kite',
  confirm: 'Confirm Execution',
}
const STEP_NUMS = { preview: 1, execute: 2, confirm: 3 }

export default function ActionWorkflowModal({ action, holdings, totals, data, onClose, onConfirm, onBypass }) {
  const [step, setStep]     = useState('preview')
  const [order, setOrder]   = useState(null)   // { qty, price }
  const openedAt            = useRef(Date.now())

  useEffect(() => { openedAt.current = Date.now() }, [action])

  if (!action) return null

  const holding = holdings?.find(h =>
    h.sym === action.stock || h.name === action.stock
  )

  const buckets = data?.bucketTargets || {}
  const bucket  = holding ? (buckets[holding.bucket] || {}) : {}
  const bucketHoldings = holdings?.filter(h => h.bucket === holding?.bucket) || []
  const bucketVal    = bucketHoldings.reduce((s, h) => s + h.value, 0)
  const bucketTarget = bucket.target || 0

  const handlePreviewNext = ({ qty, price }) => {
    setOrder({ qty, price })
    setStep('execute')
    // open kite automatically
    window.open('https://kite.zerodha.com', '_blank', 'noopener')
  }

  const handleConfirm = ({ filledQty, filledPrice, thesis }) => {
    onConfirm({
      action,
      filledQty,
      filledPrice,
      thesis,
      execLatencyMs: Date.now() - openedAt.current,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#020610]/95 backdrop-blur-md" onClick={onClose} />

      <div className="bg-card border border-[#223355] rounded-2xl w-full max-w-md relative z-10 shadow-[0_10px_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Top accent */}
        <div className="absolute left-0 top-0 right-0 h-[2px] bg-gradient-to-r from-green/20 to-green/60" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              {/* Step indicator */}
              <div className="flex items-center gap-1">
                {(['preview', 'execute', 'confirm']).map((s, i) => (
                  <div key={s} className="flex items-center gap-1">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-meta font-bold transition-all ${
                      s === step          ? 'bg-zinc-800 text-white' :
                      STEP_NUMS[s] < STEP_NUMS[step] ? 'bg-green text-white' :
                      'bg-white/10 text-text-dim'
                    }`}>
                      {STEP_NUMS[s] < STEP_NUMS[step] ? '✓' : i + 1}
                    </div>
                    {i < 2 && <div className={`w-5 h-px ${STEP_NUMS[s] < STEP_NUMS[step] ? 'bg-green/40' : 'bg-white/10'}`} />}
                  </div>
                ))}
              </div>
              <span className="text-xs font-bold text-text-sec">{STEP_TITLES[step]}</span>
            </div>
            <button onClick={onClose} className="text-text-dim hover:text-white transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step content */}
          {step === 'preview' && (
            <StepPreview
              action={action}
              holding={holding}
              bucketVal={bucketVal}
              bucketTarget={bucketTarget}
              totalVal={totals?.totalVal || 0}
              onNext={handlePreviewNext}
              onClose={onClose}
              onBypass={onBypass}
            />
          )}
          {step === 'execute' && order && (
            <StepExecute
              action={action}
              qty={order.qty}
              price={order.price}
              onNext={() => setStep('confirm')}
              onBack={() => setStep('preview')}
            />
          )}
          {step === 'confirm' && order && (
            <StepConfirm
              action={action}
              qty={order.qty}
              price={order.price}
              onSubmit={handleConfirm}
              onBack={() => setStep('execute')}
            />
          )}
        </div>
      </div>
    </div>
  )
}
