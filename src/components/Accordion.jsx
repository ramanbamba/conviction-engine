/**
 * P6-6: Unified Accordion component
 * 
 * Replaces both:
 *  - native <details>/<summary> pattern (RiskRegister)
 *  - isExpanded boolean state pattern (MacroIntelligencePanel, verdict cards)
 * 
 * Uses CSS max-height transition — not display:none — for smooth animation.
 * 
 * Props:
 *   title       — ReactNode  — always visible trigger content
 *   children    — ReactNode  — collapsed/expanded content
 *   defaultOpen — bool       — initial state (default false)
 *   className   — string     — outer wrapper class
 *   titleClassName — string  — trigger row class override
 *   chevron     — bool       — show chevron icon (default true)
 *   noBorder    — bool       — suppress trigger border-bottom when open
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function Accordion({
  title,
  children,
  defaultOpen = false,
  className = '',
  titleClassName = '',
  chevron = true,
  noBorder = false,
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={className}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-3 text-left cursor-pointer select-none outline-none group transition-colors ${
          !noBorder && open ? 'border-b border-white/5 pb-3 mb-3' : ''
        } ${titleClassName}`}
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0">{title}</span>
        {chevron && (
          <ChevronDown
            className={`shrink-0 w-4 h-4 text-text-dim transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* Content — CSS max-height transition */}
      <div
        className="accordion-content"
        data-open={String(open)}
        aria-hidden={!open}
      >
        {children}
      </div>
    </div>
  )
}
