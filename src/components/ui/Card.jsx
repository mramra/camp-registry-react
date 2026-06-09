export default function Card({ title, icon, children, className='', action }) {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-5 mb-4 ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-accent font-bold text-sm">
            {icon && <span>{icon}</span>}{title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
