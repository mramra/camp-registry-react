export default function Spinner({ size='md', className='' }) {
  const s = { sm: 'w-5 h-5 border-2', md: 'w-8 h-8 border-2', lg: 'w-12 h-12 border-4' }
  return (
    <div className={`${s[size]} border-accent/30 border-t-accent rounded-full animate-spin ${className}`} />
  )
}
