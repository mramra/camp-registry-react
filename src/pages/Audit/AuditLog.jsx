/**
 * AuditLog.jsx — سجل التغييرات
 * يعرض آخر العمليات: إضافة / تعديل / حذف
 */
import { useState, useEffect } from 'react'
import { ORG_ID, supabase } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import SearchBar from '../../components/ui/SearchBar'

const OP_STYLE = {
  INSERT: { label:'➕ إضافة', color:'text-green',  bg:'bg-green/10'  },
  UPDATE: { label:'✏️ تعديل', color:'text-accent', bg:'bg-accent/10' },
  DELETE: { label:'🗑️ حذف',  color:'text-red',    bg:'bg-red/10'    },
}

const TABLE_LABELS = {
  families:         '👨‍👩‍👧 الأسر',
  family_members:   '👤 الأفراد',
  camps:            '🏕️ المخيمات',
  org_members:      '👥 المستخدمون',
  family_movements: '🔄 الحركات',
  dist_rounds:      '📦 التوزيعات',
}

export default function AuditLog() {
  const { online } = useApp()
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [opFilter,setOpFilter]= useState('')

  useEffect(() => { loadLogs() }, [])

  async function loadLogs() {
    setLoading(true)
    try {
      // استخدم جدول audit_logs إذا موجود، وإلا اصنع سجل من updated_at
      const tables = ['families','family_members','family_movements','dist_rounds']
      const all = []

      await Promise.all(tables.map(async t => {
        try {
          let q = supabase.from(t).select('id,updated_at,created_at,head_name,name,type')
            .order('updated_at', { ascending:false }).limit(20)
          if (['families','family_movements','dist_rounds'].includes(t))
            q = q.eq('org_id', ORG_ID)
          const { data } = await q
          if (data?.length) {
            data.forEach(r => {
              const isNew = r.created_at === r.updated_at || !r.updated_at
              all.push({
                id:        r.id + t,
                table:     t,
                op:        isNew ? 'INSERT' : 'UPDATE',
                label:     r.head_name || r.name || r.type || r.id?.slice(0,8),
                time:      r.updated_at || r.created_at,
              })
            })
          }
        } catch (e) { console.warn(`[audit] فشل جلب سجل جدول ${t}:`, e.message) }
      }))

      // ترتيب حسب الوقت
      all.sort((a,b) => new Date(b.time) - new Date(a.time))
      setLogs(all.slice(0,100))
    } catch (e) { console.warn('[audit] فشل تحميل السجل:', e.message) }
    finally { setLoading(false) }
  }

  const filtered = logs.filter(l => {
    if (opFilter && l.op !== opFilter) return false
    if (search && !l.label?.includes(search) && !TABLE_LABELS[l.table]?.includes(search)) return false
    return true
  })

  function formatTime(t) {
    if (!t) return '—'
    const d = new Date(t)
    return d.toLocaleString('ar-EG', { dateStyle:'short', timeStyle:'short' })
  }

  return (
    <div>
      <PageHeader icon="📝" title="سجل التغييرات" subtitle="آخر 100 عملية"/>

      <div className="flex gap-2 mb-3">
        <SearchBar value={search} onChange={setSearch} placeholder="بحث باسم..." className="flex-1"/>
        <select value={opFilter} onChange={e=>setOpFilter(e.target.value)}
          className="bg-surface2 border border-border rounded-xl px-3 text-white text-sm focus:outline-none">
          <option value="">الكل</option>
          <option value="INSERT">إضافة</option>
          <option value="UPDATE">تعديل</option>
          <option value="DELETE">حذف</option>
        </select>
      </div>

      <button onClick={loadLogs} disabled={loading}
        className="w-full mb-3 py-2 rounded-xl text-xs font-bold text-accent border border-accent/30">
        {loading ? '⏳ جاري التحميل...' : '🔄 تحديث'}
      </button>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner/></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📝" title="لا توجد سجلات"/>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map(l => {
            const op = OP_STYLE[l.op] || OP_STYLE.UPDATE
            return (
              <div key={l.id} className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${op.color} ${op.bg}`}>
                  {op.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-xs font-bold truncate">{l.label || '—'}</div>
                  <div className="text-muted text-[10px]">{TABLE_LABELS[l.table]||l.table}</div>
                </div>
                <span className="text-muted text-[10px] flex-shrink-0">{formatTime(l.time)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
