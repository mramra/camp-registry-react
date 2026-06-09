export default function SearchBar({ value, onChange, placeholder='بحث...' }) {
  return (
    <div className="relative mb-4">
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">🔍</span>
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface2 border border-border rounded-xl pr-9 pl-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-accent"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">✕</button>
      )}
    </div>
  )
}
