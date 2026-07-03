/**
 * P6-2: ToastStack component
 *
 * Fixed bottom-right container, stacks up to 3 toasts.
 * Animates in: slide-in-from-right + fade-in
 * Animates out: fade-out on dismiss
 */
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react'

const TYPE_META = {
  success: {
    icon: CheckCircle,
    border: 'border-green/40',
    bg: 'bg-green/10',
    icon_color: 'text-green',
    text: 'text-green',
  },
  error: {
    icon: AlertTriangle,
    border: 'border-red/40',
    bg: 'bg-red/10',
    icon_color: 'text-red',
    text: 'text-red',
  },
  info: {
    icon: Info,
    border: 'border-zinc-700',
    bg: 'bg-zinc-800',
    icon_color: 'text-zinc-400',
    text: 'text-zinc-400',
  },
}

export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts?.length) return null

  return (
    <div
      className="fixed bottom-6 right-4 md:right-6 z-[9999] flex flex-col gap-2.5 pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {toasts.map(t => {
        const meta = TYPE_META[t.type] || TYPE_META.info
        const Icon = meta.icon
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 min-w-[260px] max-w-[340px] rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md
              ${meta.border} ${meta.bg}
              animate-in slide-in-from-right-4 fade-in duration-300`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.icon_color}`} />
            <p className="flex-1 text-body text-text-pri leading-snug">{t.message}</p>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 text-text-dim hover:text-text-sec transition-colors ml-1 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
