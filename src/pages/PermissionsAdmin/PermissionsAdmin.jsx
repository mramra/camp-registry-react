/**
 * PermissionsAdmin.jsx — إدارة صلاحيات الصفحات
 * يدخلها فقط platform_owner. تتحكم بمن يرى أي صفحة:
 *   - حسب الدور (الإعداد العام لكل platform_owner/super_admin/camp_delegate/assistant)
 *   - استثناء فردي لمستخدم معيّن (يطغى على إعداد الدور)
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { supabase, ORG_ID } from '../../lib/supabase'
import { ROLE_LABELS } from '../../lib/permissions'
import {
  PAGE_REGISTRY, getAllPagePermissions, setPagePermission,
  clearPagePermission, canAccessPageSync,
} from '../../lib/pagePermissions'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'

const ROLES = ['platform_owner', 'super_admin', 'camp_delegate', 'assistant']
// المالك دائماً كل الصفحات — لا حاجة لإدارته، نعرضه فقط للعلم
const EDITABLE_ROLES = ['super_admin', 'camp_delegate', 'assistant']

export default function PermissionsAdmin() {
  const { profile, isOwner, refetchPagePermissions } = useAuth()
  const { showToast } = useApp()
  const [rows,  setRows]  = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('roles') // 'roles' | 'users'
  const [selectedUserId, setSelectedUserId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [permRows, { data: usersData }] = await Promise.all([
        getAllPagePermissions(),
        supabase.from('org_members').select('id,user_id,full_name,role').eq('org_id', ORG_ID),
      ])
      setRows(permRows)
      setUsers((usersData || []).filter(u => u.role !== 'platform_owner'))
    } catch (e) {
      showToast('خطأ في التحميل: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  // قيمة الخلية الحالية لإعداد الدور (مأخوذة من rows، أو null إذا غير محدّد = يستخدم الافتراضي)
  function getRoleValue(role, pageKey) {
    const r = rows.find(x => x.scope === 'role' && x.scope_value === role && x.page_key === pageKey)
    return r ? r.allowed : null
  }

  function getUserValue(userId, pageKey) {
    const r = rows.find(x => x.scope === 'user' && x.scope_value === userId && x.page_key === pageKey)
    return r ? r.allowed : null
  }

  async function toggleRole(role, pageKey) {
    const current = getRoleValue(role, pageKey)
    setSaving(true)
    try {
      if (current === null) {
        // لا إعداد محفوظ بعد → احفظ "ممنوع" كأول نقرة (نفترض كان مسموحاً بالافتراضي، فالنقرة تقفله)
        await setPagePermission({ scope: 'role', scopeValue: role, pageKey, allowed: false, updatedBy: profile?.user_id })
      } else if (current === true) {
        await setPagePermission({ scope: 'role', scopeValue: role, pageKey, allowed: false, updatedBy: profile?.user_id })
      } else {
        await setPagePermission({ scope: 'role', scopeValue: role, pageKey, allowed: true, updatedBy: profile?.user_id })
      }
      const fresh = await getAllPagePermissions()
      setRows(fresh)
      refetchPagePermissions?.()
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    } finally {
      setSaving(false)
    }
  }

  async function resetRole(role, pageKey) {
    setSaving(true)
    try {
      await clearPagePermission({ scope: 'role', scopeValue: role, pageKey })
      const fresh = await getAllPagePermissions()
      setRows(fresh)
      refetchPagePermissions?.()
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    } finally {
      setSaving(false)
    }
  }

  async function toggleUser(userId, pageKey) {
    const current = getUserValue(userId, pageKey)
    setSaving(true)
    try {
      if (current === null) {
        await setPagePermission({ scope: 'user', scopeValue: userId, pageKey, allowed: false, updatedBy: profile?.user_id })
      } else if (current === true) {
        await setPagePermission({ scope: 'user', scopeValue: userId, pageKey, allowed: false, updatedBy: profile?.user_id })
      } else {
        await setPagePermission({ scope: 'user', scopeValue: userId, pageKey, allowed: true, updatedBy: profile?.user_id })
      }
      const fresh = await getAllPagePermissions()
      setRows(fresh)
      refetchPagePermissions?.()
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    } finally {
      setSaving(false)
    }
  }

  async function clearUserOverride(userId, pageKey) {
    setSaving(true)
    try {
      await clearPagePermission({ scope: 'user', scopeValue: userId, pageKey })
      const fresh = await getAllPagePermissions()
      setRows(fresh)
      refetchPagePermissions?.()
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    } finally {
      setSaving(false)
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

  const pageKeys = Object.keys(PAGE_REGISTRY).filter(k => k !== 'page_permissions')
  const selectedUser = users.find(u => u.user_id === selectedUserId)

  // شارة تظهر حالة الخلية: مسموح (افتراضي)، ممنوع (افتراضي)، مسموح (محدّد)، ممنوع (محدّد)
  function Cell({ value, onToggle, onReset }) {
    const isOverridden = value !== null
    const allowed = value === null ? null : value // لا نملك الافتراضي هنا بدقة، فقط نعرض الحالة المحفوظة
    return (
      <button
        onClick={onToggle}
        onContextMenu={(e) => { e.preventDefault(); if (isOverridden) onReset() }}
        disabled={saving}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{
          background: value === true ? 'rgba(16,185,129,0.15)' : value === false ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.1)',
          color: value === true ? '#10b981' : value === false ? '#ef4444' : '#6b7280',
          border: `1px solid ${value === true ? 'rgba(16,185,129,0.4)' : value === false ? 'rgba(239,68,68,0.4)' : 'rgba(107,114,128,0.3)'}`,
        }}
        title={isOverridden ? 'محدّد يدوياً — اضغط مطولاً لإعادة الضبط للافتراضي' : 'يستخدم الافتراضي'}
      >
        {value === true ? '✓' : value === false ? '✕' : '·'}
      </button>
    )
  }

  return (
    <div className="pb-8">
      <PageHeader icon="🔐" title="إدارة الصلاحيات" subtitle="من يرى أي صفحة" back />

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('roles')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${tab==='roles' ? 'bg-accent text-black' : 'bg-surface2 text-muted'}`}>
          حسب الدور
        </button>
        <button onClick={() => setTab('users')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${tab==='users' ? 'bg-accent text-black' : 'bg-surface2 text-muted'}`}>
          استثناء مستخدم
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl p-3 mb-4 text-[11px] text-muted">
        <span className="text-green font-bold">✓ مسموح</span> · <span className="text-red font-bold">✕ ممنوع</span> · <span className="text-muted">· افتراضي النظام</span>
        <br />اضغط للتبديل، واضغط مطولاً (أو كليك يمين) لإعادة الضبط للافتراضي.
      </div>

      {tab === 'roles' && (
        <div className="flex flex-col gap-3">
          {pageKeys.map(pageKey => (
            <div key={pageKey} className="bg-surface border border-border rounded-xl p-3">
              <div className="text-white text-xs font-bold mb-2.5">{PAGE_REGISTRY[pageKey].label}</div>
              <div className="flex flex-col gap-1.5">
                {EDITABLE_ROLES.map(role => (
                  <div key={role} className="flex items-center justify-between">
                    <span className="text-muted text-[11px]">{ROLE_LABELS[role]}</span>
                    <Cell
                      value={getRoleValue(role, pageKey)}
                      onToggle={() => toggleRole(role, pageKey)}
                      onReset={() => resetRole(role, pageKey)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div>
          <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm mb-4 focus:outline-none">
            <option value="">اختر مستخدماً لتخصيص صلاحياته...</option>
            {users.map(u => (
              <option key={u.id} value={u.user_id}>{u.full_name} — {ROLE_LABELS[u.role] || u.role}</option>
            ))}
          </select>

          {selectedUser && (
            <div className="flex flex-col gap-2">
              {pageKeys.map(pageKey => (
                <div key={pageKey} className="bg-surface border border-border rounded-xl p-3 flex items-center justify-between">
                  <span className="text-white text-xs font-bold">{PAGE_REGISTRY[pageKey].label}</span>
                  <Cell
                    value={getUserValue(selectedUserId, pageKey)}
                    onToggle={() => toggleUser(selectedUserId, pageKey)}
                    onReset={() => clearUserOverride(selectedUserId, pageKey)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
