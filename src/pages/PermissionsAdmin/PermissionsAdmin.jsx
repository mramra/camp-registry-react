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
  { key: 'super_admin',   label: 'مدير الإيواء' },
  { key: 'camp_delegate', label: 'المندوب' },
  { key: 'assistant',     label: 'المساعد' },
]

function Cell({ value, busy, onSet }) {
  const current = value === true ? 'true' : value === false ? 'false' : 'default'
  const colors = {
    true:    { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.4)' },
    false:   { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', border: 'rgba(239,68,68,0.4)' },
    default: { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', border: 'rgba(107,114,128,0.3)' },
  }
  const c = colors[current]
  return (
    <select
      disabled={busy}
      value={current}
      onChange={(e) => onSet(e.target.value === 'true' ? true : e.target.value === 'false' ? false : null)}
      className="w-full rounded-lg text-sm font-bold text-center px-0.5 py-1.5 appearance-none"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, minWidth: '32px' }}
    >
      <option value="true">✓</option>
      <option value="false">✕</option>
      <option value="default">↺</option>
    </select>
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
        <table className="w-full text-right" style={{ minWidth: '420px' }}>
          <thead>
            <tr className="border-b border-border">
              <th className="text-muted text-[11px] font-bold py-2 pr-1 text-right sticky right-0 bg-bg" style={{ width: '110px' }}>الصفحة</th>
              {ROLES.map(r => (
                <th key={r.key} className="text-muted text-[10px] font-bold py-2 text-center">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageKeys.map(pageKey => (
              <tr key={pageKey} className="border-b border-border/50">
                <td className="text-white text-[11px] font-bold py-2 pr-1 sticky right-0 bg-bg leading-tight" style={{ width: '110px' }}>
                  {PAGE_REGISTRY[pageKey].label}
                </td>
                {ROLES.map(role => {
                  const cellKey = `${role.key}:${pageKey}`
                  return (
                    <td key={role.key} className="py-2">
                      <Cell
                        value={getValue(role.key, pageKey)}
                        busy={saving === cellKey}
                        onSet={(v) => setValue(role.key, pageKey, v)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
