import { default as SC } from './Spinner'

export default function StatCard({ icon, value, label, sub, color, onClick, loading }) {
  const c = color || 'text-accent'
  return (
    <div
      className={`bg-surface border border-border rounded-2xl p-4 flex flex-col items-center gap-1 ${onClick ? 'cursor-pointer active:scale-95 transition-all' : ''}`}
      onClick={onClick}
    >
      <span className="text-3xl mb-1">{icon}</span>
      {loading ? (
        <div className="w-12 h-5 bg-surface2 rounded animate-pulse"/>
      ) : (
        <span className={`font-black text-2xl ${c}`}>
          {typeof value === 'number' ? value.toLocaleString('ar') : value ?? '—'}
        </span>
      )}
      <span className="text-muted text-xs text-center">{label}</span>
      {sub && <span className="text-muted text-[10px]">{sub}</span>}
    </div>
  )
}
