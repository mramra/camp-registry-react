/**
 * PermissionsAdmin.jsx — إدارة صلاحيات الصفحات (تصميم جدول مبسَّط)
 * صف لكل صفحة، عمود لكل دور، وبكل خلية 3 رموز صغيرة للاختيار المباشر:
 *   ✓ مسموح دائماً  /  ✕ ممنوع دائماً  /  ↺ افتراضي النظام
 * يدخلها فقط platform_owner.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import {
  PAGE_REGISTRY, getAllPagePermissions, setPagePermission, clearPagePermission,
} from '../../lib/pagePermissions'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'

const ROLES = [
  { key: 'super_admin',   label: 'مدير الإيواء', shortLabel: 'إيواء' },
  { key: 'camp_delegate', label: 'المندوب',      shortLabel: 'مندوب' },
  { key: 'assistant',     label: 'المساعد',      shortLabel: 'مساعد' },
]

const COLORS = {
  true:    { bg: 'rgba(16,185,129,0.15)',  color: '#10b981', border: 'rgba(16,185,129,0.4)',  icon: '✓' },
  false:   { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444', border: 'rgba(239,68,68,0.4)',   icon: '✕' },
  default: { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', border: 'rgba(107,114,128,0.3)', icon: '↺' },
}
const OPTIONS = [
  { key: 'true',    icon: '✓' },
  { key: 'false',   icon: '✕' },
  { key: 'default', icon: '↺' },
]

function Cell({ value, busy, onSet }) {
  const [open, setOpen] = useState(false)
  const current = value === true ? 'true' : value === false ? 'false' : 'default'
  const c = COLORS[current]

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(o => !o)}
        className="rounded-lg text-sm font-bold flex items-center justify-center"
        style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, width: '30px', height: '28px' }}
      >
        {c.icon}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute z-20 mt-1 rounded-lg overflow-hidden shadow-lg flex flex-col"
            style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', left: '50%', transform: 'translateX(-50%)' }}
          >
            {OPTIONS.map(opt => {
              const oc = COLORS[opt.key]
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onSet(opt.key === 'true' ? true : opt.key === 'false' ? false : null)
                  }}
                  className="flex items-center justify-center text-sm font-bold"
                  style={{ color: oc.color, width: '30px', height: '28px', background: opt.key === current ? oc.bg : 'transparent' }}
                >
                  {opt.icon}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function PermissionsAdmin() {
  const { profile, isOwner, refetchPagePermissions } = useAuth()
  const { showToast } = useApp()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null) // 'roleKey:pageKey'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setRows(await getAllPagePermissions())
    } catch (e) {
      showToast('خطأ في التحميل: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  function getValue(role, pageKey) {
    const r = rows.find(x => x.scope === 'role' && x.scope_value === role && x.page_key === pageKey)
    return r ? r.allowed : null
  }

  async function setValue(role, pageKey, allowed) {
    const cellKey = `${role}:${pageKey}`
    setSaving(cellKey)
    try {
      if (allowed === null) {
        await clearPagePermission({ scope: 'role', scopeValue: role, pageKey })
      } else {
        await setPagePermission({ scope: 'role', scopeValue: role, pageKey, allowed, updatedBy: profile?.user_id })
      }
      setRows(await getAllPagePermissions())
      refetchPagePermissions?.()
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    } finally {
      setSaving(null)
    }
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <p className="text-white font-bold">هذه الصفحة لمالك المنصة فقط</p>
      </div>
    )
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const pageKeys = Object.keys(PAGE_REGISTRY).filter(k => !['page_permissions', 'dashboard'].includes(k))

  return (
    <div className="pb-8">
      <PageHeader icon="🔐" title="إدارة الصلاحيات" subtitle="من يرى كل صفحة" back />

      <div className="bg-surface border border-border rounded-xl p-3 mb-3 text-[11px] text-muted leading-relaxed">
        <span className="text-green font-bold">✓ مسموح</span> ·
        {' '}<span className="text-red font-bold">✕ ممنوع</span> ·
        {' '}<span className="text-muted font-bold">↺ افتراضي النظام</span>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-right" style={{ minWidth: '225px' }}>
          <thead>
            <tr className="border-b border-border">
              <th className="text-muted text-[11px] font-bold py-2 pr-1 text-right sticky right-0 bg-bg" style={{ width: '90px' }}>الصفحة</th>
              {ROLES.map(r => (
                <th key={r.key} className="text-muted text-[9px] font-bold py-2 text-center" style={{ width: '45px' }}>{r.shortLabel}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageKeys.map((pageKey, idx) => {
              const rowBg = idx % 2 === 0 ? '#0d1117' : '#161b22'
              return (
                <tr key={pageKey} className="border-b border-border/50" style={{ background: rowBg }}>
                  <td className="text-white text-[11px] font-bold py-2 pr-1 sticky right-0 leading-tight" style={{ width: '90px', background: rowBg }}>
                    {PAGE_REGISTRY[pageKey].label}
                  </td>
                  {ROLES.map(role => {
                    const cellKey = `${role.key}:${pageKey}`
                    return (
                      <td key={role.key} className="py-2 text-center" style={{ width: '45px' }}>
                        <Cell
                          value={getValue(role.key, pageKey)}
                          busy={saving === cellKey}
                          onSet={(v) => setValue(role.key, pageKey, v)}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
