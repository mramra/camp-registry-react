export default function EmptyState({ icon, title, subtitle, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-3">{icon || '📭'}</span>
      <p className="text-white font-bold text-sm">{title || 'لا توجد بيانات'}</p>
      {subtitle && <p className="text-muted text-xs mt-1">{subtitle}</p>}
      {action && onAction && (
        <button onClick={onAction} className="mt-4 px-4 py-2 bg-accent text-bg rounded-xl text-sm font-bold">
          {action}
        </button>
      )}
    </div>
  )
}
