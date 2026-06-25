import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import {
  approveRequest, canUserReviewRequest, fetchPendingRequests, fetchDecisionLog,
  rejectRequest, useLocalDB,
} from '../../lib/db'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const ACTION_LABEL = {
  insert: { icon: '➕', label: 'إضافة أسرة جديدة', color: '#10b981' },
  update: { icon: '✏️', label: 'تعديل بيانات أسرة', color: '#3b82f6' },
  delete: { icon: '🗑️', label: 'طلب حذف أسرة', color: '#ef4444' },
  movement_entry:    { icon: '🟢', label: 'تسجيل دخول أسرة',     color: '#10b981' },
  movement_exit:     { icon: '🔴', label: 'تسجيل خروج أسرة',     color: '#ef4444' },
  movement_transfer: { icon: '🔵', label: 'نقل أسرة بين مخيمات', color: '#3b82f6' },
  camp_insert: { icon: '🏕️', label: 'طلب إضافة مخيم', color: '#10b981' },
  camp_update: { icon: '🏕️', label: 'طلب تعديل مخيم', color: '#3b82f6' },
  camp_delete: { icon: '🏕️', label: 'طلب حذف مخيم',   color: '#ef4444' },
  user_insert: { icon: '👤', label: 'طلب إضافة مستخدم', color: '#10b981' },
  user_update: { icon: '👤', label: 'طلب تعديل مستخدم', color: '#3b82f6' },
  user_delete: { icon: '👤', label: 'طلب حذف مستخدم',   color: '#ef4444' },
}

const ROLE_LABEL = {
  platform_owner: 'ملك المنصة',
  super_admin: 'مدير الإيواء',
  camp_delegate: 'المندوب',
  assistant: 'المساعد',
}

function FieldDiff({ changes }) {
  if (!changes || typeof changes !== 'object') return null
  const entries = Object.entries(changes)
  if (!entries.length) return null
  return (
    <div className="bg-surface2 rounded-xl p-3 mt-2 space-y-1.5">
      {entries.map(([field, diff]) => (
        <div key={field} className="text-[11px]">
          <span className="text-muted font-bold">{field}: </span>
          <span className="text-red line-through">{String(diff?.old ?? diff?.[0] ?? '—')}</span>
          <span className="text-muted"> ← </span>
          <span className="text-green">{String(diff?.new ?? diff?.[1] ?? '—')}</span>
        </div>
      ))}
    </div>
  )
}

function RequestHeader({ req, navigate, campMap, famMap }) {
  const meta = ACTION_LABEL[req.action] || ACTION_LABEL.update
  const isMovement = req.action?.startsWith('movement_')
  const isCamp = req.action?.startsWith('camp_')
  const isUser = req.action?.startsWith('user_')
  const famName = req.new_data?.head_name || req.old_data?.head_name || famMap?.[req.family_id]?.head_name || req.family_name || '—'
  const campData = req.new_data || req.old_data || {}
  const campName = campData.name || '—'
  const userData = req.new_data || req.old_data || {}
  const userName = userData.full_name || '—'
  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <span className="font-bold text-white text-sm">{meta.label}</span>
          </div>
          <div className="text-muted text-xs mt-0.5">
            👤 {req.user_name || '—'} ({ROLE_LABEL[req.user_role] || req.user_role || '—'})
            • {req.created_at ? new Date(req.created_at).toLocaleString('ar') : ''}
          </div>
        </div>
        {!isCamp && !isUser && (
          <button onClick={() => navigate(`/families/edit/${req.family_id}`)}
            className="text-accent text-[11px] font-bold whitespace-nowrap">
            عرض الأسرة ←
          </button>
        )}
      </div>

      <div className="bg-surface2 rounded-xl px-3 py-2 mb-2">
        <span className="text-white font-bold text-sm">{isCamp ? campName : isUser ? userName : famName}</span>
      </div>

      {req.action === 'update' && <FieldDiff changes={req.changes} />}

      {isUser && (
        <div className="bg-surface2 rounded-xl p-3 mt-2 text-[11px] text-muted space-y-1">
          <div>🏷️ الدور المطلوب: <span className="text-white font-bold">{ROLE_LABEL[userData.role] || userData.role || '—'}</span></div>
          {userData.phone && <div>📱 الجوال: <span className="text-white">{userData.phone}</span></div>}
          {userData.camp_id && (
            <div>🏕️ المخيم: <span className="text-white font-bold">{campMap?.[userData.camp_id] || '—'}</span></div>
          )}
          {req.action === 'user_insert' && <div className="text-amber-400">⚠️ كلمة المرور ستُعرَض لك بعد الموافقة — شاركها مع المستخدم</div>}
        </div>
      )}

      {isCamp && (
        <div className="bg-surface2 rounded-xl p-3 mt-2 text-[11px] text-muted space-y-1">
          <div>🏷️ النوع: <span className="text-white font-bold">{campData.camp_type === 'sub' ? 'فرع' : 'رئيسي'}</span></div>
          {campData.parent_camp_id && (
            <div>🏕️ تابع لـ: <span className="text-white font-bold">{campMap?.[campData.parent_camp_id] || '—'}</span></div>
          )}
          {campData.address && <div>📍 العنوان: <span className="text-white">{campData.address}</span></div>}
          {req.action === 'camp_update' && req.old_data && (
            <div className="pt-1 border-t border-border mt-1">قبل التعديل: <span className="text-muted">{req.old_data.name}</span></div>
          )}
        </div>
      )}

      {isMovement && (
        <div className="bg-surface2 rounded-xl p-3 mt-2 text-[11px] text-muted space-y-1">
          {req.new_data?.from_camp && (
            <div>📤 من: <span className="text-white font-bold">{campMap?.[req.new_data.from_camp] || '—'}</span></div>
          )}
          {req.new_data?.to_camp && (
            <div>📥 إلى: <span className="text-white font-bold">{campMap?.[req.new_data.to_camp] || '—'}</span></div>
          )}
          <div>📅 التاريخ: <span className="text-white font-bold">{req.new_data?.date || '—'}</span></div>
          {req.new_data?.reason && <div>📝 السبب: <span className="text-white">{req.new_data.reason}</span></div>}
          {req.new_data?.notes && <div>🗒️ ملاحظات: <span className="text-white">{req.new_data.notes}</span></div>}
        </div>
      )}
    </>
  )
}

export default function PendingRequests() {
  const { profile, isOwner } = useAuth()
  const { showToast } = useApp()
  const { query } = useLocalDB()
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending') // 'pending' | 'log'
  const [requests, setRequests] = useState([])
  const [decisionLog, setDecisionLog] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [busyId,   setBusyId]   = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [note, setNote] = useState('')
  const [campMap, setCampMap] = useState({})
  const [famMap,  setFamMap]  = useState({})

  const canReview = isOwner || profile?.can_review_approvals === true

  useEffect(() => { if (canReview) load() }, [canReview, tab])

  async function load() {
    setLoading(true)
    try {
      const [members, camps, fams] = await Promise.all([
        query('org_members'), query('camps'), query('families'),
      ])
      const byUserId = Object.fromEntries(members.map(m => [m.user_id, m]))
      setCampMap(Object.fromEntries(camps.map(c => [c.id, c.name])))
      setFamMap(Object.fromEntries(fams.map(f => [f.id, f])))

      if (tab === 'pending') {
        const rows = await fetchPendingRequests()
        // فلترة: يظهر فقط للمستخدم لو هو platform_owner، أو مخوَّل هرمياً
        const visible = isOwner ? rows : rows.filter(r => canUserReviewRequest(profile, byUserId[r.changed_by]))
        setRequests(visible)
      } else {
        const rows = await fetchDecisionLog()
        const visible = isOwner ? rows : rows.filter(r => canUserReviewRequest(profile, byUserId[r.changed_by]))
        setDecisionLog(visible)
      }
    } catch (e) {
      showToast('خطأ: ' + e.message, true)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(req) {
    setBusyId(req.id)
    const res = await approveRequest(req, profile)
    setBusyId(null)
    if (res.ok) {
      showToast('✅ تمت الموافقة على الطلب')
      setRequests(r => r.filter(x => x.id !== req.id))
    } else {
      showToast('خطأ: ' + res.error, true)
    }
  }

  async function handleReject(req) {
    setBusyId(req.id)
    const res = await rejectRequest(req, profile, note)
    setBusyId(null)
    setRejectingId(null)
    setNote('')
    if (res.ok) {
      showToast('✅ تم رفض الطلب وإعادة البيانات لحالتها السابقة')
      setRequests(r => r.filter(x => x.id !== req.id))
    } else {
      showToast('خطأ: ' + res.error, true)
    }
  }

  if (!canReview) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">⛔</div>
        <p className="text-muted">لا تملك صلاحية مراجعة الطلبات</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader icon="📋" title="الطلبات المعلّقة"
        subtitle={tab === 'pending' ? `${requests.length} طلب بانتظار مراجعتك` : `${decisionLog.length} قرار سابق`} />

      {/* تبويبان */}
      <div className="flex gap-2 mb-4 bg-surface2 rounded-xl p-1">
        <button onClick={() => setTab('pending')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'pending' ? 'bg-accent text-bg' : 'text-muted'}`}>
          ⏳ معلّقة
        </button>
        <button onClick={() => setTab('log')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'log' ? 'bg-accent text-bg' : 'text-muted'}`}>
          📜 سجل القرارات
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>

      ) : tab === 'pending' ? (
        requests.length === 0 ? (
          <EmptyState icon="✅" title="لا توجد طلبات معلّقة" subtitle="كل التعديلات والإضافات تمت الموافقة عليها" />
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map(req => (
              <div key={req.id} className="bg-surface border border-border rounded-2xl p-4">
                <RequestHeader req={req} navigate={navigate} campMap={campMap} famMap={famMap} />

                {req.action === 'delete' && req.old_data && (
                  <div className="bg-red/10 border border-red/20 rounded-xl px-3 py-2 text-[11px] text-muted">
                    سيُحذف هذا السجل نهائياً من قاعدة البيانات عند الموافقة — لا يمكن التراجع بعدها.
                  </div>
                )}

                {rejectingId === req.id ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <textarea value={note} onChange={e => setNote(e.target.value)}
                      placeholder="ملاحظة الرفض (اختياري)..."
                      className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-red resize-none"
                      rows={2} />
                    <div className="flex gap-2">
                      <button onClick={() => handleReject(req)} disabled={busyId === req.id}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-red bg-red/10 border border-red/30 disabled:opacity-50">
                        {busyId === req.id ? '⏳ جاري...' : '✕ تأكيد الرفض'}
                      </button>
                      <button onClick={() => { setRejectingId(null); setNote('') }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-muted bg-surface2 border border-border">
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleApprove(req)} disabled={busyId === req.id}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-green bg-green/10 border border-green/30 disabled:opacity-50">
                      {busyId === req.id ? '⏳ جاري...' : '✓ موافقة'}
                    </button>
                    <button onClick={() => setRejectingId(req.id)} disabled={busyId === req.id}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-red bg-red/10 border border-red/30 disabled:opacity-50">
                      ✕ رفض
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )

      ) : (
        decisionLog.length === 0 ? (
          <EmptyState icon="📜" title="لا توجد قرارات سابقة" subtitle="ستظهر هنا كل الطلبات بعد الموافقة أو الرفض عليها" />
        ) : (
          <div className="flex flex-col gap-3">
            {decisionLog.map(req => (
              <div key={req.id} className="bg-surface border border-border rounded-2xl p-4">
                <RequestHeader req={req} navigate={navigate} campMap={campMap} famMap={famMap} />

                <div className={`rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between
                  ${req.status === 'approved' ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
                  <span>{req.status === 'approved' ? '✓ تمت الموافقة' : '✕ تم الرفض'}</span>
                  <span className="text-[10px] opacity-80">
                    {req.reviewed_by_name || '—'} ({ROLE_LABEL[req.reviewed_by_role] || req.reviewed_by_role || '—'})
                  </span>
                </div>
                {req.review_note && (
                  <div className="text-muted text-[11px] mt-1.5">📝 {req.review_note}</div>
                )}
                <div className="text-muted text-[10px] mt-1">
                  {req.reviewed_at ? new Date(req.reviewed_at).toLocaleString('ar') : ''}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
