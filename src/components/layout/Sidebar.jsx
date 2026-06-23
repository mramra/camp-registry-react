import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/permissions'

const NAV_GROUPS = [
  {
    id: 'main',
    icon: '🏠',
    label: 'الرئيسية',
    items: [
      { icon: '🏠', label: 'الرئيسية',   path: '/',          pageKey: 'dashboard' },
    ],
  },
  {
    id: 'families',
    icon: '👨‍👩‍👧',
    label: 'الأسر',
    items: [
      { icon: '👨‍👩‍👧', label: 'قائمة الأسر',  path: '/families',      pageKey: 'families' },
      { icon: '🔄',  label: 'حركات الأسر',  path: '/movements',     pageKey: 'movements' },
      { icon: '📦',  label: 'التوزيعات',    path: '/distributions', pageKey: 'distributions' },
    ],
  },
  {
    id: 'camps_users',
    icon: '🏕️',
    label: 'المخيمات والمستخدمون',
    items: [
      { icon: '🏕️', label: 'المخيمات',      path: '/camps',              pageKey: 'camps' },
      { icon: '👥', label: 'المستخدمون',    path: '/users',              pageKey: 'users' },
      { icon: '🔐', label: 'الصلاحيات',      path: '/permissions-admin',  pageKey: 'page_permissions' },
      { icon: '📋', label: 'الطلبات المعلّقة', path: '/pending-requests',  pageKey: 'pending_requests' },
    ],
  },
  {
    id: 'social_health',
    icon: '⚕️',
    label: 'السجلات الاجتماعية والصحية',
    items: [
      { icon: '📋', label: 'السجلات',         path: '/registers',    pageKey: 'registers' },
      { icon: '👩', label: 'النساء',          path: '/women',        pageKey: 'women' },
      { icon: '🧒', label: 'سجل الأطفال',     path: '/children',     pageKey: 'children' },
      { icon: '⚕️', label: 'كشف الحالات الصحية', path: '/health-report', pageKey: 'health_report' },
      { icon: '📋', label: 'تقارير الاحتياجات', path: '/needs-report', pageKey: 'needs_report' },
    ],
  },
  {
    id: 'reports',
    icon: '📊',
    label: 'التحليل والتقارير',
    items: [
      { icon: '📊', label: 'التحليل',             path: '/analysis',     pageKey: 'analysis' },
      { icon: '🏕️', label: 'مقارنة المخيمات',    path: '/camp-compare', pageKey: 'camp_compare' },
      { icon: '📤', label: 'الاستيراد والتصدير',  path: '/export',       pageKey: 'export' },
    ],
  },
  {
    id: 'admin',
    icon: '⚙️',
    label: 'الإدارة والنظام',
    items: [
      { icon: '📝', label: 'سجل التغييرات',  path: '/audit',               pageKey: 'audit' },
      { icon: '🔔', label: 'التنبيهات',       path: '/alerts',              pageKey: 'alerts' },
      { icon: '🛠️', label: 'إدارة البيانات',  path: '/data',                pageKey: 'data' },
      { icon: '🩺', label: 'تشخيص النظام',   path: '/diagnostics',         pageKey: 'diagnostics' },
      { icon: '🛡️', label: 'الفحص الأمني',   path: '/security-audit',      pageKey: 'security_audit' },
      { icon: '📱', label: 'الأجهزة',        path: '/devices',             pageKey: 'devices' },
    ],
  },
  {
    id: 'comm_account',
    icon: '💬',
    label: 'التواصل والحساب',
    items: [
      { icon: '✉️', label: 'الرسائل',     path: '/sms',           pageKey: 'sms' },
      { icon: '⚙️', label: 'الإعدادات',  path: '/settings',      pageKey: 'settings' },
      { icon: '💳', label: 'الاشتراكات', path: '/subscription',  pageKey: 'subscription' },
      { icon: '❓', label: 'المساعدة',   path: '/help',          pageKey: 'help' },
    ],
  },
]

// يحدد أي قسم يحتوي المسار الحالي
function getActiveGroupId(pathname) {
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)) {
        return g.id
      }
    }
  }
  return null
}

export default function Sidebar({ open, onClose }) {
  const { profile, role, canAccessPageNow, signOut } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [confirmLogout, setConfirmLogout] = useState(false)

  // عند فتح القائمة: افتح القسم الذي يحتوي الصفحة الحالية فقط
  const [openGroups, setOpenGroups] = useState(() => {
    const activeId = getActiveGroupId(location.pathname)
    const init = {}
    NAV_GROUPS.forEach(g => { init[g.id] = g.id === activeId })
    return init
  })

  // عند تغيير المسار: أغلق كل الأقسام وافتح القسم الجديد
  useEffect(() => {
    const activeId = getActiveGroupId(location.pathname)
    setOpenGroups(prev => {
      const next = {}
      NAV_GROUPS.forEach(g => { next[g.id] = g.id === activeId })
      return next
    })
  }, [location.pathname])

  function toggleGroup(id) {
    setOpenGroups(prev => {
      // إذا كان مفتوحاً → أغلقه، إذا كان مغلقاً → افتحه وأغلق الباقي
      const isNowOpen = prev[id]
      const next = {}
      NAV_GROUPS.forEach(g => { next[g.id] = false })
      if (!isNowOpen) next[id] = true
      return next
    })
  }

  function isVisible(item) {
    return canAccessPageNow(item.pageKey)
  }

  async function handleLogout() {
    if (!confirmLogout) { setConfirmLogout(true); return }
    await signOut()
    navigate('/login')
  }

  const LINK   = 'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all mb-0.5'
  const ACTIVE = 'bg-accent/15 text-accent'
  const IDLE   = 'text-muted hover:text-white hover:bg-surface2'

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* الدرار */}
      <div
        className={`fixed inset-y-0 right-0 z-[300] w-72 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'var(--bg, #0a0f1a)' }}
      >
        {/* الرأس */}
        <div className="p-5 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏕️</span>
              <span className="text-accent font-black text-sm">نبض المخيم</span>
            </div>
            <button
              onClick={onClose}
              className="text-muted text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface2"
            >
              ✕
            </button>
          </div>
          <p className="text-white font-black text-sm">{profile?.full_name || '—'}</p>
          <p className={`text-xs font-bold mt-0.5 ${ROLE_COLORS[role] || 'text-muted'}`}>
            {ROLE_LABELS[role] || role}
          </p>
        </div>

        {/* الروابط */}
        <nav className="flex-1 overflow-y-auto p-3">
          {NAV_GROUPS.map(group => {
            const visible = group.items.filter(isVisible)
            if (!visible.length) return null

            const isOpen    = openGroups[group.id]
            const hasActive = visible.some(item =>
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
            )

            return (
              <div key={group.id} className="mb-1">
                {/* زر القسم */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl
                    transition-all mb-0.5 ${
                      hasActive
                        ? 'text-accent bg-accent/10'
                        : 'text-muted hover:text-white hover:bg-surface2'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{group.icon}</span>
                    <span className="text-[11px] font-black tracking-wide">{group.label}</span>
                  </div>
                  <span
                    className="text-xs transition-transform duration-200"
                    style={{ display:'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    ▾
                  </span>
                </button>

                {/* العناصر — تظهر فقط إذا القسم مفتوح */}
                {isOpen && (
                  <div className="pr-2 border-r-2 border-accent/20 mr-4 mb-1">
                    {visible.map(item => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) => `${LINK} ${isActive ? ACTIVE : IDLE}`}
                      >
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* تسجيل الخروج */}
        <div className="p-4 border-t border-border flex-shrink-0">
          <button
            onClick={handleLogout}
            className={`w-full py-2.5 rounded-xl text-sm font-black transition-all ${
              confirmLogout
                ? 'bg-red-500 text-white'
                : 'bg-surface2 text-muted hover:text-red-400 hover:bg-red-500/10'
            }`}
          >
            {confirmLogout ? '⚠️ تأكيد الخروج؟' : '🚪 تسجيل الخروج'}
          </button>
          {confirmLogout && (
            <button
              onClick={() => setConfirmLogout(false)}
              className="w-full mt-1 py-1.5 text-xs text-muted text-center"
            >
              إلغاء
            </button>
          )}
        </div>
      </div>
    </>
  )
}
