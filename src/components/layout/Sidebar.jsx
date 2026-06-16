import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/permissions'

export default function Sidebar({ onClose }) {
  const { profile, role, isOwner, isSuperAdmin, isCampDelegate,
          canWrite, canExport, canImport, canPage, signOut } = useAuth()
  const navigate = useNavigate()
  const [confirmLogout, setConfirmLogout] = useState(false)

  // ── تعريف الصفحات مع شروط الظهور ────────────────────────
  const NAV = [
    {
      group: 'الرئيسية',
      items: [
        { icon:'🏠', label:'الرئيسية',   path:'/',           always: true },
      ]
    },
    {
      group: 'الأسر',
      items: [
        { icon:'👨‍👩‍👧', label:'قائمة الأسر',  path:'/families',   always: true,  pageKey:'page-families' },
        { icon:'🏕️', label:'المخيمات',    path:'/camps',      always: true },
      ]
    },
    {
      group: 'العمليات',
      items: [
        { icon:'🔄', label:'حركات الأسر', path:'/movements',  always: true,    pageKey:'page-movements' },
        { icon:'📦', label:'التوزيعات',   path:'/distributions', always: true, pageKey:'page-dist' },
        { icon:'📋', label:'السجلات',     path:'/registers',  always: true,    pageKey:'page-children' },
      ]
    },
    {
      group: 'التحليل والتقارير',
      items: [
        { icon:'📊', label:'التحليل',     path:'/analysis',   reports: true },
        { icon:'📤', label:'الاستيراد والتصدير', path:'/export', exportOrImport: true },
      ]
    },
    {
      group: 'الإدارة',
      items: [
        { icon:'👥', label:'المستخدمون',  path:'/users',      admin: true },
        { icon:'🛠️', label:'إدارة البيانات', path:'/data',   owner: true },
      ]
    },
  ]

  function isVisible(item) {
    if (item.always) {
      // المساعد يتحقق من allowed_pages
      if (role === 'assistant' && item.pageKey)
        return canPage(item.pageKey, 'view')
      return true
    }
    if (item.owner)         return isOwner
    if (item.admin)         return isSuperAdmin || isOwner || isCampDelegate
    if (item.reports)       return isSuperAdmin || isOwner || isCampDelegate
    if (item.exportOrImport)return canExport || canImport
    return false
  }

  async function handleLogout() {
    if (!confirmLogout) { setConfirmLogout(true); return }
    await signOut()
    navigate('/login')
  }

  const LI = "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
  const ACT = "bg-accent/15 text-accent"
  const INP = "text-muted hover:text-white hover:bg-surface2"

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* رأس الـ sidebar */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-2xl">🏕️</span>
          <button onClick={onClose} className="text-muted text-xl">✕</button>
        </div>
        <p className="text-white font-black text-sm">{profile?.full_name || '—'}</p>
        <p className={`text-xs font-bold mt-0.5 ${ROLE_COLORS[role] || 'text-muted'}`}>
          {ROLE_LABELS[role] || role}
        </p>
        {profile?.camp_id && (
          <p className="text-muted text-[10px] mt-0.5">🏕️ مخيم محدد</p>
        )}
      </div>

      {/* الروابط */}
      <nav className="flex-1 overflow-y-auto p-3">
        {NAV.map(group => {
          const visible = group.items.filter(isVisible)
          if (!visible.length) return null
          return (
            <div key={group.group} className="mb-3">
              <p className="text-muted text-[10px] font-black px-4 mb-1 uppercase tracking-wider">
                {group.group}
              </p>
              {visible.map(item => (
                <NavLink key={item.path} to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `${LI} ${isActive ? ACT : INP} mb-0.5`
                  }>
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* تسجيل الخروج */}
      <div className="p-4 border-t border-border">
        <button onClick={handleLogout}
          className={`w-full py-2.5 rounded-xl text-sm font-black transition-all ${
            confirmLogout
              ? 'bg-red text-white'
              : 'bg-surface2 text-muted hover:text-red hover:bg-red/10'
          }`}>
          {confirmLogout ? '⚠️ تأكيد الخروج؟' : '🚪 تسجيل الخروج'}
        </button>
        {confirmLogout && (
          <button onClick={() => setConfirmLogout(false)}
            className="w-full mt-1 py-2 text-xs text-muted">
            إلغاء
          </button>
        )}
      </div>
    </div>
  )
}
