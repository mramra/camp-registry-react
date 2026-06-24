/**
 * Devices.jsx — إدارة الأجهزة مع اعتماد هرمي (منقولة ومطوَّرة من النسخة القديمة)
 * تسجيل الجهاز نفسه يحدث مركزياً في AuthContext.signIn عند الدخول (مرتبطاً بـ user_id
 * وبصمة ثابتة) — هذه الصفحة فقط تعرض الأجهزة وتمنح اعتماد/حظر حسب نفس تسلسل
 * المراجعة الهرمي المستخدم في موافقة الأسر (canUserReviewRequest):
 *   مساعد ← مندوبه أو مدير الإيواء أو ملك المنصة
 *   مندوب ← مدير الإيواء أو ملك المنصة
 *   مدير إيواء ← ملك المنصة فقط
 * ملك المنصة معفى تماماً من أي قيد جهاز ويرى/يدير كل الأجهزة.
 */
import { useState, useEffect, useMemo } from 'react'
import { ORG_ID, supabase, canUserReviewRequest, approveDevice, blockDevice, unblockDevice, fetchDeviceAuditMap } from '../../lib/db'
import { getDeviceFingerprint, formatDate, formatDateTime } from '../../lib/utils'
import { ROLE_LABELS } from '../../lib/permissions'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [members, setMembers] = useState([])
  const [auditMap, setAuditMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyId,  setBusyId]  = useState(null)
  const { showToast, online } = useApp()
  const { isOwner, isSuperAdmin, profile } = useAuth()

  const myFingerprint = getDeviceFingerprint()

  useEffect(() => {
    if (online) loadDevices()
    else setLoading(false)
  }, [online])

  async function loadDevices() {
    setLoading(true)
    try {
      const [{ data: devs, error }, { data: mems }] = await Promise.all([
        supabase.from('devices').select('*').eq('org_id', ORG_ID).order('last_seen', { ascending: false }),
        supabase.from('org_members').select('*').eq('org_id', ORG_ID),
      ])
      if (error) throw error
      setDevices(devs || [])
      setMembers(mems || [])
      setAuditMap(await fetchDeviceAuditMap((devs || []).map(d => d.id)))
    } catch (err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  const byUserId = useMemo(() => Object.fromEntries(members.map(m => [m.user_id, m])), [members])

  // الرؤية: مالك المنصة يرى الكل. غيره يرى جهازه الخاص + أجهزة من يحق له مراجعتهم هرمياً.
  const visibleDevices = useMemo(() => {
    if (isOwner) return devices
    return devices.filter(d => {
      if (d.user_id === profile?.user_id) return true
      const owner = byUserId[d.user_id]
      return !!owner && canUserReviewRequest(profile, owner)
    })
  }, [devices, byUserId, isOwner, profile])

  function canManage(owner) {
    return isOwner || (!!owner && canUserReviewRequest(profile, owner))
  }

  async function runAction(d, owner, fn, okMsg) {
    setBusyId(d.id)
    try { await fn({ ...d, owner_name: owner?.full_name }, profile); showToast(okMsg); await loadDevices() }
    catch (e) { showToast('خطأ: ' + e.message, true) }
    finally { setBusyId(null) }
  }

  async function removeDevice(id) {
    if (!isOwner && !isSuperAdmin) { showToast('⛔ لا تملك صلاحية إزالة الأجهزة', true); return }
    if (!window.confirm('إزالة هذا الجهاز نهائياً؟')) return
    try {
      await supabase.from('devices').delete().eq('id', id)
      setDevices(ds => ds.filter(x => x.id !== id))
      showToast('✅ تم إزالة الجهاز')
    } catch (err) { showToast('خطأ: ' + err.message, true) }
  }

  const pendingCount = visibleDevices.filter(d => !d.is_approved && !d.is_blocked).length

  return (
    <div>
      <PageHeader icon="📱" title="إدارة الأجهزة"
        subtitle={`${visibleDevices.length} جهاز${pendingCount ? ` — ⏳ ${pendingCount} بانتظار الموافقة` : ''}`} />

      {!online && <div className="bg-red/10 border border-red/30 text-red text-xs rounded-xl p-3 mb-4 text-center">يتطلب اتصالاً</div>}

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : visibleDevices.length === 0 ? <EmptyState icon="📱" title="لا توجد أجهزة" />
      : (
        <div className="flex flex-col gap-2">
          {visibleDevices.map(d => {
            const owner   = byUserId[d.user_id]
            const isMine  = d.fingerprint === myFingerprint
            const manage  = canManage(owner)
            return (
              <div key={d.id} className={`bg-surface border ${isMine ? 'border-accent/40' : 'border-border'} rounded-xl p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className="text-sm">{d.device_name || '🌐 جهاز'}</span>
                      {isMine && <Badge color="accent">هذا الجهاز</Badge>}
                      {d.is_blocked ? <Badge color="red">🚫 محظور</Badge>
                        : d.is_approved ? <Badge color="green">✅ معتمد</Badge>
                        : <Badge color="accent">⏳ بانتظار الموافقة</Badge>}
                    </div>
                    <div className="text-white text-xs font-bold">
                      {owner?.full_name || '— مستخدم غير معروف'}
                      {owner?.role && <span className="text-muted font-normal"> ({ROLE_LABELS[owner.role] || owner.role})</span>}
                    </div>
                    <div className="text-muted text-[10px] mt-0.5">آخر نشاط: {formatDate(d.last_seen)}</div>
                    {auditMap[d.id] && (
                      <div className="text-muted text-[10px] mt-1 bg-surface2 rounded-lg px-2 py-1 inline-block">
                        {{device_approved:'✅ اعتمده', device_blocked:'🚫 حظره', device_unblocked:'رفع الحظر عنه'}[auditMap[d.id].action] || auditMap[d.id].action}
                        {' '}<span className="text-white font-bold">{auditMap[d.id].user_name}</span>
                        {' '}— {formatDateTime(auditMap[d.id].created_at)}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {manage && !d.is_blocked && !d.is_approved && (
                      <button onClick={() => runAction(d, owner, approveDevice, '✅ تم اعتماد الجهاز')} disabled={busyId === d.id}
                        className="text-green text-[11px] font-bold bg-green/10 border border-green/20 px-2.5 py-1 rounded-lg disabled:opacity-50">
                        ✅ اعتماد
                      </button>
                    )}
                    {manage && !d.is_blocked && (
                      <button onClick={() => runAction(d, owner, blockDevice, '🚫 تم حظر الجهاز')} disabled={busyId === d.id}
                        className="text-red text-[11px] font-bold bg-red/10 border border-red/20 px-2.5 py-1 rounded-lg disabled:opacity-50">
                        🚫 حظر
                      </button>
                    )}
                    {manage && d.is_blocked && (
                      <button onClick={() => runAction(d, owner, unblockDevice, 'تم رفع الحظر — لا يزال يحتاج اعتماداً')} disabled={busyId === d.id}
                        className="text-accent text-[11px] font-bold bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-lg disabled:opacity-50">
                        رفع الحظر
                      </button>
                    )}
                    {!isMine && (isOwner || isSuperAdmin) && (
                      <button onClick={() => removeDevice(d.id)}
                        className="text-muted text-[11px] bg-surface2 border border-border px-2.5 py-1 rounded-lg">
                        🗑️ إزالة
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
