export default function Badge({ children, color='accent' }) {
  const colors = {
    accent: 'bg-accent/15 text-accent border-accent/30',
    green:  'bg-green/15 text-green border-green/30',
    red:    'bg-red/15 text-red border-red/30',
    blue:   'bg-blue/15 text-blue border-blue/30',
    purple: 'bg-purple/15 text-purple border-purple/30',
    muted:  'bg-surface2 text-muted border-border',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${colors[color] || colors.muted}`}>
      {children}
    </span>
  )
}
