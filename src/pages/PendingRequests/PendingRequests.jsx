import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { useLocalDB } from '../../lib/useLocalDB'
import { fetchPendingRequests, approveRequest, rejectRequest, canUserReviewRequest } from '../../lib/familyApproval'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const ACTION_LABEL = {
  insert: { icon: '➕', label: 'إضافة أسرة جديدة', color: '#10b981' },
  update: { icon: '✏️', label: 'تعديل بيانات أسرة', color: '#3b82f6' },
  delete: { icon: '🗑️', label: 'طلب حذف أسرة', color: '#ef4444' },
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

export default function PendingRequests() {
  const { profile, isOwner } = useAuth()
  const { showToast } = useApp()
  const { query } = useLocalDB()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [busyId,   setBusyId]   = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [note, setNote] = useState('')

  const canReview = isOwner || profile?.can_review_approvals === true

  useEffect(() => { if (canReview) load() }, [canReview])

  async function load() {
    setLoading(true)
    try {
      const [rows, members] = await Promise.all([
        fetchPendingRequests(),
        query('org_members'),
      ])
      const byUserId = Object.fromEntries(members.map(m => [m.user_id, m]))
      // فلترة: يظهر فقط للمستخدم لو هو platform_owner، أو مخوَّل هرمياً
      // (الحماية الحقيقية في RLS — هذا فقط لتجربة استخدام نظيفة لا تعرض ما لا يخصه)
      const visible = isOwner
        ? rows
        : rows.filter(r => canUserReviewRequest(profile, byUserId[r.changed_by]))
      setRequests(visible)
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
      <PageHeader icon="📋" title="الطلبات المعلّقة" subtitle={`${requests.length} طلب بانتظار مراجعتك`} />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : requests.length === 0 ? (
        <EmptyState icon="✅" title="لا توجد طلبات معلّقة" subtitle="كل التعديلات والإضافات تمت الموافقة عليها" />
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map(req => {
            const meta = ACTION_LABEL[req.action] || ACTION_LABEL.update
            const famName = req.new_data?.head_name || req.old_data?.head_name || req.family_name || '—'
            return (
              <div key={req.id} className="bg-surface border border-border rounded-2xl p-4">
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
                  <button onClick={() => navigate(`/families/edit/${req.family_id}`)}
                    className="text-accent text-[11px] font-bold whitespace-nowrap">
                    عرض الأسرة ←
                  </button>
                </div>

                <div className="bg-surface2 rounded-xl px-3 py-2 mb-2">
                  <span className="text-white font-bold text-sm">{famName}</span>
                </div>

                {req.action === 'update' && <FieldDiff changes={req.changes} />}

                {req.action === 'delete' && req.old_data && (
                  <div className="bg-red/10 border border-red/20 rounded-xl px-3 py-2 text-[11px] text-muted">
                    سيُحذف هذا السجل نهائياً من قاعدة البيانات عند الموافقة — لا يمكن التراجع بعدها.
                  </div>
                )}

                {/* أزرار الإجراء */}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
