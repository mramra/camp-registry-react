import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/permissions'

export default function Sidebar({ open, onClose }) {
  const { profile, role, isOwner, isSuperAdmin, isCampDelegate,
          canWrite, canExport, canImport, canPage, can, signOut } = useAuth()
  const navigate = useNavigate()
  const [confirmLogout, setConfirmLogout] = useState(false)

  const NAV = [
    {
      group: 'الرئيسية',
      items: [
        { icon:'🏠', label:'الرئيسية',   path:'/' },
      ]
    },
    {
      group: 'الأسر',
      items: [
        { icon:'👨‍👩‍👧', label:'قائمة الأسر',  path:'/families',  pageKey:'page-families' },
        { icon:'🏕️', label:'المخيمات',    path:'/camps' },
      ]
    },
    {
      group: 'العمليات',
      items: [
        { icon:'🔄', label:'حركات الأسر',      path:'/movements',     pageKey:'page-movements' },
        { icon:'📦', label:'التوزيعات',         path:'/distributions', pageKey:'page-dist' },
        { icon:'📋', label:'السجلات',           path:'/registers',     pageKey:'page-children' },
      ]
    },
    {
      group: 'التحليل والتقارير',
      items: [
        { icon:'📊', label:'التحليل',             path:'/analysis',     need:'reports' },
        { icon:'📋', label:'تقارير الاحتياجات',  path:'/needs-report', always:true },
        { icon:'🏕️', label:'مقارنة المخيمات',   path:'/camp-compare', need:'reports' },
        { icon:'📤', label:'الاستيراد والتصدير',  path:'/export',        needExport: true },
      ]
    },
    {
      group: 'الإدارة',
      items: [
        { icon:'👥', label:'المستخدمون',    path:'/users',  needAdmin: true },
        { icon:'📝', label:'سجل التغييرات', path:'/audit',  needAdmin: true },
        { icon:'🔔', label:'التنبيهات',     path:'/alerts', needAdmin: true },
        { icon:'🛠️', label:'إدارة البيانات', path:'/data',  needOwner: true },
      ]
    },
  ]

  function isVisible(item) {
    if (item.needOwner)  return isOwner
    if (item.needAdmin)  return isSuperAdmin || isOwner || isCampDelegate
    if (item.need)       return can(item.need)
    if (item.needExport) return canExport || canImport
    if (item.pageKey && role === 'assistant') return canPage(item.pageKey, 'view')
    return true
  }

  async function handleLogout() {
    if (!confirmLogout) { setConfirmLogout(true); return }
    await signOut()
    navigate('/login')
  }

  const LINK = "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all mb-0.5"
  const ACTIVE = "bg-accent/15 text-accent"
  const IDLE   = "text-muted hover:text-white hover:bg-surface2"

  return (
    <>
      {/* درار — fixed overlay من اليمين */}
      <div
        className={`fixed inset-y-0 right-0 z-[300] w-72 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'var(--bg, #0a0f1a)' }}
      >
        {/* رأس */}
        <div className="p-5 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-2xl">🏕️</span>
            <button onClick={onClose}
              className="text-muted text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface2">
              ✕
            </button>
          </div>
          <p className="text-white font-black text-sm">{profile?.full_name || '—'}</p>
          <p className={`text-xs font-bold mt-0.5 ${ROLE_COLORS[role] || 'text-muted'}`}>
            {ROLE_LABELS[role] || role}
          </p>
        </div>

        {/* روابط */}
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
                    className={({ isActive }) => `${LINK} ${isActive ? ACTIVE : IDLE}`}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        {/* تسجيل الخروج */}
        <div className="p-4 border-t border-border flex-shrink-0">
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
              className="w-full mt-1 py-1.5 text-xs text-muted text-center">
              إلغاء
            </button>
          )}
        </div>
      </div>
    </>
  )
}
