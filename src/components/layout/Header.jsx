import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import GlobalSearch from '../search/GlobalSearch'

export default function Header({ onMenuClick }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const { online, syncing, syncStats } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const total = syncStats?.total || 0
  const statusColor = !online ? '#ef4444' : syncing ? '#f59e0b' : total > 0 ? '#f59e0b' : '#10b981'
  const statusLabel = !online ? 'أوف لاين' : syncing ? 'مزامنة' : total > 0 ? `${total} معلق` : 'متصل'

  return (
    <header className="sticky top-0 z-[100] bg-gradient-to-r from-[#1a2332] to-bg border-b-2 border-accent px-4 py-3 flex items-center justify-between shadow-[0_4px_20px_rgba(245,158,11,0.15)]">
      {/* زر القائمة */}
      <button onClick={onMenuClick}
        className="w-10 h-10 bg-surface2 border border-border rounded-xl flex items-center justify-center text-xl text-white"
        aria-label="القائمة">
        ☰
      </button>

      {/* العنوان */}
      <button onClick={() => navigate('/')} className="flex items-center gap-2">
        <span className="text-xl">🏕️</span>
        <div className="text-right">
          <div className="text-accent font-black text-base leading-none">نبض المخيم</div>
          {profile?.full_name && (
            <div className="text-muted text-[10px] mt-0.5 truncate max-w-28">{profile.full_name}</div>
          )}
        </div>
      </button>

      {/* البحث الشامل + حالة الاتصال */}
      <div className="flex items-center gap-2">
        <button onClick={() => setSearchOpen(true)}
          className="w-9 h-9 bg-surface2 border border-border rounded-xl flex items-center justify-center text-base text-white"
          aria-label="بحث شامل">
          🔍
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-muted">{statusLabel}</span>
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${syncing ? 'animate-pulse' : ''}`}
            style={{ background: statusColor }} />
        </div>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
