export default function StatCard({ icon, value, label, color='accent', onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-surface border border-border rounded-xl p-4 text-center w-full transition-all ${onClick ? 'active:scale-95 hover:border-accent/50' : ''}`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-2xl font-black text-${color}`}>{value}</div>
      <div className="text-muted text-[11px] mt-1">{label}</div>
    </button>
  )
}
