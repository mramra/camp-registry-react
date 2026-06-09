import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'

export default function Header({ onMenuClick }) {
  const { online, syncing, fullSync, fullSyncing, lastSync } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const statusColor = online
    ? (syncing || fullSyncing ? '#f59e0b' : '#10b981')
    : '#ef4444'

  const statusLabel = fullSyncing ? 'جلب...'
    : syncing ? 'مزامنة'
    : online ? 'متصل'
    : 'أوف لاين'

  // وقت آخر مزامنة
  const lastSyncText = lastSync
    ? new Date(lastSync).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <header className="sticky top-0 z-[100] bg-gradient-to-r from-[#1a2332] to-bg border-b-2 border-accent px-4 py-3 flex items-center justify-between shadow-[0_4px_20px_rgba(245,158,11,0.15)]">
      {/* زر القائمة */}
      <button onClick={onMenuClick}
        className="w-10 h-10 bg-surface2 border border-border rounded-xl flex items-center justify-center text-xl text-white">
        ☰
      </button>

      {/* العنوان */}
      <button onClick={() => navigate('/')} className="flex items-center gap-2">
        <span className="text-xl">🏕️</span>
        <div className="text-right">
          <div className="text-accent font-black text-base leading-none">نبض المخيم</div>
          {profile?.full_name && (
            <div className="text-muted text-[10px] mt-0.5">{profile.full_name}</div>
          )}
        </div>
      </button>

      {/* حالة الاتصال + زر المزامنة */}
      <div className="flex items-center gap-2">
        {/* زر Full Sync */}
        {online && (
          <button onClick={fullSync} disabled={fullSyncing}
            title={lastSyncText ? `آخر مزامنة: ${lastSyncText}` : 'مزامنة البيانات'}
            className="w-8 h-8 bg-surface2 border border-border rounded-lg flex items-center justify-center text-sm disabled:opacity-50">
            {fullSyncing ? '⏳' : '⬇️'}
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-muted">{statusLabel}</span>
          <span className={`w-2.5 h-2.5 rounded-full ${(syncing || fullSyncing) ? 'animate-pulse' : ''}`}
            style={{ background: statusColor }} />
        </div>
      </div>
    </header>
  )
}
