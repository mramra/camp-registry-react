import { useNavigate } from 'react-router-dom'

export default function PageHeader({ title, icon, subtitle, back, action }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center justify-between mb-5 pt-2">
      <div className="flex items-center gap-3">
        {back && (
          <button onClick={() => navigate(-1)} className="text-muted text-lg">←</button>
        )}
        {icon && <span className="text-2xl">{icon}</span>}
        <div>
          <h1 className="text-white font-black text-lg leading-none">{title}</h1>
          {subtitle && <p className="text-muted text-xs mt-1">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
