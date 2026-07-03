export default function ConvDot({ score }) {
  const color = score >= 8 ? 'var(--green)' : score >= 6 ? 'var(--amber)' : 'var(--red)'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1 bg-dark rounded-sm overflow-hidden">
        <div className="h-full rounded-sm" style={{ width: `${(score / 10) * 100}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono text-meta font-bold" style={{ color }}>{score}</span>
    </div>
  )
}
