/**
 * SectionHeader — the one section-title primitive.
 *
 * Locks a single typographic hierarchy across every surface: bold title,
 * muted subtitle, optional leading icon and right-aligned slot. Replaces the
 * ad-hoc <div><h3/><p/></div> blocks scattered across tabs.
 */
export default function SectionHeader({ title, subtitle, icon: Icon, right, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-body font-black text-white flex items-center gap-2 leading-tight">
          {Icon && <Icon className="w-4 h-4 shrink-0 text-zinc-400" />}
          {title}
        </h3>
        {subtitle && <p className="text-caption text-zinc-500 leading-snug mt-1">{subtitle}</p>}
      </div>
      {right != null && <div className="shrink-0">{right}</div>}
    </div>
  )
}
