export default function Input({ label, error, icon, className='', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-bold text-muted">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{icon}</span>}
        <input
          className={`w-full bg-surface2 border ${error ? 'border-red' : 'border-border'} rounded-xl px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-accent transition-colors ${icon ? 'pr-9' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-red text-xs">{error}</p>}
    </div>
  )
}
