export default function SearchBar({ value, onChange, placeholder, className }) {
  return (
    <input type="search" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder || 'بحث...'}
      className={`w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm placeholder-muted focus:outline-none focus:border-accent ${className||''}`}
    />
  )
}
