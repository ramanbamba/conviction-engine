import { CheckCircle } from 'lucide-react'

/**
 * EmptyState — one consistent "nothing to do here" treatment.
 * Calm, not alarming: a quiet book is the desired state for a buy-and-forget product.
 */
export default function EmptyState({ icon: Icon = CheckCircle, title, sub, tone = 'green' }) {
  const cls = tone === 'green' ? 'text-green' : tone === 'amber' ? 'text-amber' : 'text-zinc-500'
  const ring = tone === 'green' ? 'bg-green/10' : tone === 'amber' ? 'bg-amber/10' : 'bg-white/5'
  return (
    <div className="calm-rise flex items-center gap-3.5 py-5 px-1">
      <div className={`w-9 h-9 rounded-full ${ring} flex items-center justify-center shrink-0`}>
        <Icon className={`w-[18px] h-[18px] ${cls}`} strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <div className="text-body font-bold text-zinc-200 leading-snug">{title}</div>
        {sub && <div className="text-caption text-zinc-500 leading-snug mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}
