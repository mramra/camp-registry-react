import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'

export default function Header({ onMenuClick }) {
  const { online, syncing, pendingCount } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const statusColor = online ? (syncing ? '#f59e0b' : '#10b981') : '#ef4444'
  const statusLabel = syncing ? 'مزامنة' : online ? 'متصل' : 'غير متصل'

  return (
    <header className="sticky top-0 z-[100] bg-gradient-to-r from-[#1a2332] to-bg border-b-2 border-accent px-4 py-3 flex items-center justify-between shadow-[0_4px_20px_rgba(245,158,11,0.15)]">
      {/* زر القائمة */}
      <button
        onClick={onMenuClick}
        className="w-10 h-10 bg-surface2 border border-border rounded-xl flex items-center justify-center text-xl text-white"
        aria-label="القائمة"
      >
        ☰
      </button>

      {/* العنوان */}
      <button onClick={() => navigate('/')} className="flex items-center gap-2">
        <span className="text-xl">⛺</span>
        <div className="text-right">
          <div className="text-accent font-black text-base leading-none">نبض المخيم</div>
          {profile?.name && (
            <div className="text-muted text-[10px] mt-0.5">{profile.name}</div>
          )}
        </div>
      </button>

      {/* حالة الاتصال */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-muted">{statusLabel}</span>
        <span
          className={`w-2.5 h-2.5 rounded-full ${syncing ? 'animate-pulse' : ''}`}
          style={{ background: statusColor }}
        />
        {pendingCount > 0 && (
          <span className="bg-red text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            {pendingCount}
          </span>
        )}
      </div>
    </header>
  )
}
