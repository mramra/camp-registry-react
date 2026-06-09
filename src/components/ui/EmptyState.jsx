export default function EmptyState({ icon='📭', title='لا توجد بيانات', subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-white font-bold text-base mb-1">{title}</h3>
      {subtitle && <p className="text-muted text-sm mb-4">{subtitle}</p>}
      {action}
    </div>
  )
}
