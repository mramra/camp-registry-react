export default function ProgressBar({ value, max, color, showLabel, height }) {
  const pct = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0
  const c = color || (pct >= 90 ? 'bg-red' : pct >= 70 ? 'bg-accent' : 'bg-green')
  const h = height || 'h-2'
  return (
    <div>
      {showLabel !== false && (
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted">{(value||0).toLocaleString()}</span>
          <span className="text-muted">{pct}%</span>
        </div>
      )}
      <div className={`w-full bg-surface2 rounded-full ${h} overflow-hidden`}>
        <div className={`${h} rounded-full transition-all ${c}`} style={{width:`${pct}%`}}/>
      </div>
    </div>
  )
}
