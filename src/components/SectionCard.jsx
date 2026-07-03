/**
 * SectionCard — collapsible card with card chrome, icon, title, summary chip.
 * Use for any secondary content that shouldn't render expanded by default.
 *
 * Props:
 *   icon        — ReactNode  (lucide icon, 3.5 h/w)
 *   title       — string
 *   summary     — string     shown in collapsed state as a dim hint
 *   badge       — string     optional count/status chip (e.g. "3 alerts")
 *   badgeColor  — string     css color for badge (default amber)
 *   defaultOpen — bool       (default false)
 *   children    — ReactNode
 *   className   — string
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function SectionCard({
  icon,
  title,
  summary,
  badge,
  badgeColor = 'var(--amber)',
  defaultOpen = false,
  children,
  className = '',
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`bg-card/50 backdrop-blur-md border rounded-xl overflow-hidden transition-colors duration-200 ${
      open ? 'border-border' : 'border-border-dim hover:border-border'
    } ${className}`}>

      {/* Header trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer select-none outline-none group"
        aria-expanded={open}
      >
        {/* Icon */}
        {icon && (
          <span className="shrink-0 text-text-dim group-hover:text-text-sec transition-colors">
            {icon}
          </span>
        )}

        {/* Title */}
        <span className="flex-1 min-w-0 flex items-center gap-2.5 flex-wrap">
          <span className="text-meta uppercase tracking-[0.12em] font-bold text-text-sec group-hover:text-text-pri transition-colors">
            {title}
          </span>
          {/* Summary — visible when collapsed, fades out when open */}
          {summary && !open && (
            <span className="text-meta font-mono text-text-dim truncate hidden sm:inline">
              {summary}
            </span>
          )}
          {/* Badge */}
          {badge && (
            <span
              className="text-meta font-black px-1.5 py-0.5 rounded font-mono"
              style={{
                color: badgeColor,
                background: `${badgeColor}20`,
                border: `1px solid ${badgeColor}40`,
              }}
            >
              {badge}
            </span>
          )}
        </span>

        {/* Chevron */}
        <ChevronDown
          className={`shrink-0 w-4 h-4 text-text-dim transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Content */}
      <div className="accordion-content" data-open={String(open)} aria-hidden={!open}>
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      </div>
    </div>
  )
}
