export default function FilterSelect({ value, onChange, options, placeholder, className }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent ${className||''}`}>
      <option value="">{placeholder || 'الكل'}</option>
      {(options||[]).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
