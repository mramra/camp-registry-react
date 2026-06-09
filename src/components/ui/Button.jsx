export default function Button({ children, variant='primary', size='md', loading, icon, className='', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary:   'bg-accent text-bg hover:bg-accent2',
    secondary: 'bg-surface2 border border-border text-white hover:border-accent',
    danger:    'bg-red/15 border border-red/40 text-red hover:bg-red/25',
    ghost:     'text-muted hover:text-white hover:bg-surface2',
    outline:   'border border-accent text-accent hover:bg-accent/10',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
    icon: 'w-10 h-10 p-0 text-lg',
  }

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={loading} {...props}>
      {loading ? <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : icon}
      {children}
    </button>
  )
}
