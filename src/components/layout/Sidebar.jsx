import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/permissions'

// ── تعريف الأقسام والصفحات ─────────────────────────────
const NAV_GROUPS = [
  {
    id: 'main',
    icon: '🏠',
    label: 'الرئيسية',
    defaultOpen: true,
    items: [
      { icon: '🏠', label: 'الرئيسية',   path: '/',          pageKey: 'dashboard' },
    ],
  },
  {
    id: 'families',
    icon: '👨‍👩‍👧',
    label: 'الأسر',
    defaultOpen: true,
    items: [
      { icon: '👨‍👩‍👧', label: 'قائمة الأسر',  path: '/families',  pageKey: 'families' },
      { icon: '🏕️', label: 'المخيمات',    path: '/camps',     pageKey: 'camps' },
    ],
  },
  {
    id: 'operations',
    icon: '🔄',
    label: 'العمليات',
    defaultOpen: true,
    items: [
      { icon: '🔄', label: 'حركات الأسر',   path: '/movements',      pageKey: 'movements' },
      { icon: '📦', label: 'التوزيعات',      path: '/distributions',  pageKey: 'distributions' },
      { icon: '📋', label: 'السجلات',        path: '/registers',      pageKey: 'registers' },
      { icon: '📚', label: 'قوائم البيانات', path: '/registries',     pageKey: 'registries' },
    ],
  },
  {
    id: 'health_social',
    icon: '⚕️',
    label: 'الصحة والاجتماعي',
    defaultOpen: false,
    items: [
      { icon: '👩',  label: 'النساء',            path: '/women',         pageKey: 'women' },
      { icon: '🧒',  label: 'سجل الأطفال',       path: '/children',      pageKey: 'children' },
      { icon: '⚕️',  label: 'الحالات الصحية',    path: '/health-report', pageKey: 'health_report' },
    ],
  },
  {
    id: 'reports',
    icon: '📊',
    label: 'التحليل والتقارير',
    defaultOpen: false,
    items: [
      { icon: '📊', label: 'التحليل',              path: '/analysis',     pageKey: 'analysis' },
      { icon: '📋', label: 'تقارير الاحتياجات',   path: '/needs-report', pageKey: 'needs_report' },
      { icon: '🏕️', label: 'مقارنة المخيمات',    path: '/camp-compare', pageKey: 'camp_compare' },
      { icon: '📤', label: 'الاستيراد والتصدير',  path: '/export',       pageKey: 'export' },
    ],
  },
  {
    id: 'admin',
    icon: '⚙️',
    label: 'الإدارة',
    defaultOpen: false,
    items: [
      { icon: '👥', label: 'المستخدمون',     path: '/users',               pageKey: 'users' },
      { icon: '📝', label: 'سجل التغييرات', path: '/audit',               pageKey: 'audit' },
      { icon: '🔔', label: 'التنبيهات',      path: '/alerts',              pageKey: 'alerts' },
      { icon: '🛠️', label: 'إدارة البيانات', path: '/data',               pageKey: 'data' },
      { icon: '🩺', label: 'تشخيص النظام',  path: '/diagnostics',         pageKey: 'diagnostics' },
      { icon: '🔐', label: 'الصلاحيات',     path: '/permissions-admin',   pageKey: 'page_permissions' },
    ],
  },
  {
    id: 'other',
    icon: '📱',
    label: 'أخرى',
    defaultOpen: false,
    items: [
      { icon: '📱', label: 'الأجهزة',    path: '/devices',      pageKey: 'devices' },
      { icon: '✉️', label: 'الرسائل',    path: '/sms',          pageKey: 'sms' },
      { icon: '⚙️', label: 'الإعدادات', path: '/settings',     pageKey: 'settings' },
      { icon: '💳', label: 'الاشتراكات', path: '/subscription', pageKey: 'subscription' },
      { icon: '❓', label: 'المساعدة',   path: '/help',         pageKey: 'help' },
    ],
  },
]

export default function Sidebar({ open, onClose }) {
  const { profile, role, canAccessPageNow, signOut } = useAuth()
  const navigate = useNavigate()
  const [confirmLogout, setConfirmLogout] = useState(false)

  // حالة كل قسم (مفتوح/مغلق)
  const [openGroups, setOpenGroups] = useState(() => {
    const init = {}
    NAV_GROUPS.forEach(g => { init[g.id] = g.defaultOpen })
    return init
  })

  function toggleGroup(id) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))
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
            const isOpen = openGroups[group.id]

            return (
              <div key={group.id} className="mb-1">
                {/* زر القسم */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl
                    text-muted hover:text-white hover:bg-surface2 transition-all mb-0.5 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{group.icon}</span>
                    <span className="text-[11px] font-black uppercase tracking-wider">{group.label}</span>
                    <span className="text-[10px] bg-surface2 group-hover:bg-surface rounded-full px-1.5 py-0.5 font-bold">
                      {visible.length}
                    </span>
                  </div>
                  <span
                    className="text-[10px] transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(90deg)' }}
                  >
                    ▾
                  </span>
                </button>

                {/* العناصر */}
                {isOpen && (
                  <div className="pr-2 border-r border-border/40 mr-3">
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
                ? 'bg-red text-white'
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
