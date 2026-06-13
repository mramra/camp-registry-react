import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { roleLabel } from '../../lib/utils'

const NAV_ITEMS = [
  { group: 'الرئيسية', items: [
    { icon: '📊', label: 'لوحة التحكم',   path: '/' },
  ]},
  { group: 'الأسر', items: [
    { icon: '👨‍👩‍👧‍👦', label: 'قائمة الأسر',     path: '/families' },
    { icon: '➕', label: 'إضافة أسرة',     path: '/families/add' },
    { icon: '🔄', label: 'حركات الأسر',    path: '/movements' },
  ]},
  { group: 'الإدارة', items: [
    { icon: '🏕️', label: 'إدارة المخيمات', path: '/camps' },
    { icon: '👥', label: 'المستخدمون',     path: '/users', adminOnly: true },
    { icon: '📦', label: 'التوزيعات',       path: '/distributions' },
    { icon: '📱', label: 'الأجهزة',         path: '/devices', adminOnly: true },
  ]},
  { group: 'التقارير', items: [
    { icon: '📈', label: 'التقارير',        path: '/analysis' },
    { icon: '🔔', label: 'التنبيهات',       path: '/alerts' },
    { icon: '📋', label: 'سجل النشاط',      path: '/audit', adminOnly: true },
  ]},
  { group: 'الأدوات', items: [
    { icon: '💾', label: 'استيراد/تصدير',  path: '/data' },
    { icon: '💬', label: 'رسائل SMS',       path: '/sms' },
    { icon: '⚙️', label: 'الإعدادات',       path: '/settings' },
    { icon: '💎', label: 'الاشتراك',        path: '/subscription' },
    { icon: '❓', label: 'المساعدة',        path: '/help' },
  ]},
]

export default function Sidebar({ open, onClose }) {
  const { profile, role, isOwner, isSuperAdmin, signOut, isPreviewMode, previewAs, setPreviewAs, realProfile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function go(path) {
    navigate(path)
    onClose()
  }

  function isActive(path) {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <aside className={`fixed top-0 right-0 w-72 h-full bg-surface border-l border-border z-[300] flex flex-col transition-transform duration-300 overflow-y-auto ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      {/* شريط المحاكاة */}
      {isPreviewMode && (
        <div style={{background:'linear-gradient(135deg,#7c3aed,#4f46e5)',padding:'10px 14px'}}>
          <div style={{color:'white',fontSize:'11px',marginBottom:'6px',fontWeight:'bold'}}>
            👁️ محاكاة: {previewAs?.full_name}
          </div>
          <button
            onClick={() => { setPreviewAs(null); navigate('/users'); onClose() }}
            style={{width:'100%',background:'white',color:'#7c3aed',border:'none',
              borderRadius:'8px',padding:'6px',fontSize:'12px',fontWeight:'900',cursor:'pointer'}}>
            ← رجوع لحسابي الحقيقي
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 p-5 border-b border-border">
        <div className="w-11 h-11 bg-accent rounded-xl flex items-center justify-center text-2xl flex-shrink-0">⛺</div>
        <div>
          <div className="font-black text-white text-base">نبض المخيم</div>
          <div className="text-muted text-xs">v2.0 React</div>
        </div>
        <button onClick={onClose} className="mr-auto text-muted text-xl">✕</button>
      </div>

      {/* User */}
      {profile && (
        <div className="px-5 py-4 border-b border-border bg-surface2">
          <div className="font-bold text-white text-sm">{profile.full_name || profile.name || '—'}</div>
          <div className="text-muted text-xs mt-0.5">{profile.national_id}</div>
          <span className="inline-block mt-1.5 bg-accent/15 text-accent border border-accent/30 rounded-full px-2.5 py-0.5 text-[10px] font-bold">
            {roleLabel(role)}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3">
        {NAV_ITEMS.map(({ group, items }) => {
          const visible = items.filter(item => {
            if (item.adminOnly && !isOwner && !isSuperAdmin) return false
          if (item.ownerOnly && !isOwner) return false
            return true
          })
          if (!visible.length) return null
          return (
            <div key={group} className="mb-1">
              <div className="text-[10px] font-bold text-muted uppercase tracking-widest px-2 py-2">{group}</div>
              {visible.map(item => (
                <button
                  key={item.path}
                  onClick={() => go(item.path)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold mb-0.5 text-right transition-all
                    ${isActive(item.path)
                      ? 'bg-accent/12 text-accent'
                      : 'text-muted hover:bg-surface2 hover:text-white'
                    }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <button
          onClick={() => { signOut(); onClose() }}
          className="w-full py-2.5 bg-transparent border border-red text-red rounded-xl font-bold text-sm"
        >
          تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
