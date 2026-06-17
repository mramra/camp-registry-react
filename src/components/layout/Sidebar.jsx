import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/permissions'

export default function Sidebar({ open, onClose }) {
  const { profile, role, canAccessPageNow, signOut } = useAuth()
  const navigate = useNavigate()
  const [confirmLogout, setConfirmLogout] = useState(false)

  // كل عنصر هنا يحمل نفس pageKey المستخدم في App.jsx وpagePermissions.js
  // — هذا يضمن تطابقاً تاماً بين ما يظهر بالقائمة وما هو مسموح فعلياً عند فتح الصفحة
  const NAV = [
    {
      group: 'الرئيسية',
      items: [
        { icon:'🏠', label:'الرئيسية',   path:'/', pageKey:'dashboard' },
      ]
    },
    {
      group: 'الأسر',
      items: [
        { icon:'👨‍👩‍👧', label:'قائمة الأسر',  path:'/families',  pageKey:'families' },
        { icon:'🏕️', label:'المخيمات',    path:'/camps', pageKey:'camps' },
      ]
    },
    {
      group: 'العمليات',
      items: [
        { icon:'🔄', label:'حركات الأسر',      path:'/movements',     pageKey:'movements' },
        { icon:'📦', label:'التوزيعات',         path:'/distributions', pageKey:'distributions' },
        { icon:'📋', label:'السجلات',           path:'/registers',     pageKey:'registers' },
        { icon:'📚', label:'قوائم البيانات',    path:'/registries',    pageKey:'registries' },
      ]
    },
    {
      group: 'التحليل والتقارير',
      items: [
        { icon:'📊', label:'التحليل',             path:'/analysis',     pageKey:'analysis' },
        { icon:'📋', label:'تقارير الاحتياجات',  path:'/needs-report', pageKey:'needs_report' },
        { icon:'🏕️', label:'مقارنة المخيمات',   path:'/camp-compare', pageKey:'camp_compare' },
        { icon:'📤', label:'الاستيراد والتصدير',  path:'/export',        pageKey:'export' },
      ]
    },
    {
      group: 'الإدارة',
      items: [
        { icon:'👥', label:'المستخدمون',    path:'/users',  pageKey:'users' },
        { icon:'📝', label:'سجل التغييرات', path:'/audit',  pageKey:'audit' },
        { icon:'🔔', label:'التنبيهات',     path:'/alerts', pageKey:'alerts' },
        { icon:'🛠️', label:'إدارة البيانات', path:'/data',        pageKey:'data' },
        { icon:'🩺', label:'تشخيص النظام',   path:'/diagnostics', pageKey:'diagnostics' },
        { icon:'🔐', label:'إدارة الصلاحيات', path:'/permissions-admin', pageKey:'page_permissions' },
      ]
    },
    {
      group: 'أخرى',
      items: [
        { icon:'📱', label:'الأجهزة',        path:'/devices',      pageKey:'devices' },
        { icon:'✉️', label:'الرسائل',         path:'/sms',          pageKey:'sms' },
        { icon:'⚙️', label:'الإعدادات',      path:'/settings',     pageKey:'settings' },
        { icon:'💳', label:'الاشتراكات',     path:'/subscription', pageKey:'subscription' },
        { icon:'❓', label:'المساعدة',        path:'/help',         pageKey:'help' },
      ]
    },
  ]

  function isVisible(item) {
    return canAccessPageNow(item.pageKey)
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
