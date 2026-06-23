/**
 * AuditLog.jsx — سجل التغييرات
 * يعرض السجل الحقيقي من family_activity_log (وليس تخميناً من updated_at):
 * يشمل عمليات الحذف الفعلية، اسم الفاعل، والتغييرات الدقيقة لكل حقل.
 * مفلتر حسب نطاق المخيمات المسموحة (useDataScope).
 */
import { useState, useEffect } from 'react'
import { supabase, ORG_ID, TRACKED_FIELDS } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useDataScope } from '../../lib/useDataScope'
import { PageHeader, Spinner, EmptyState, SearchBar, FilterSelect } from '../../components/ui'

const OP_STYLE = {
  insert: { label: '➕ إضافة', color: 'text-green',  bg: 'bg-green/10'  },
  update: { label: '✏️ تعديل', color: 'text-accent', bg: 'bg-accent/10' },
  delete: { label: '🗑️ حذف',  color: 'text-red',    bg: 'bg-red/10'    },
}

export default function AuditLog() {
  const { profile, isOwner } = useAuth()
  const { getAllowedCampIds } = useDataScope()

  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [actionFil,  setActionFil]  = useState('')
  const [actorFil,   setActorFil]   = useState('')
  const [expanded,   setExpanded]   = useState(null)

  useEffect(() => { loadLogs() }, [])

  async function loadLogs() {
    setLoading(true)
    try {
      // 1) جلب المخيمات لتحديد نطاق الرؤية المسموح
      const { data: campsList } = await supabase.from('camps').select('id,parent_camp_id,manager_id').eq('org_id', ORG_ID)
      const campIds = getAllowedCampIds(campsList || [])

      // 2) جلب الأسر ضمن النطاق المسموح فقط (لربط family_id بالمخيم)
      const { data: fams } = await supabase.from('families').select('id,camp_id').eq('org_id', ORG_ID)
      let allowedFamilyIds = null
      if (campIds !== null) {
        const set = new Set(campIds)
        allowedFamilyIds = new Set((fams || []).filter(f => set.has(f.camp_id)).map(f => f.id))
      }

      // 3) جلب السجل الحقيقي من family_activity_log
      const { data, error } = await supabase
        .from('family_activity_log')
        .select('*')
        .eq('org_id', ORG_ID)
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error

      let rows = data || []
      if (allowedFamilyIds) {
        rows = rows.filter(r => r.family_id && allowedFamilyIds.has(r.family_id))
      }
      setLogs(rows.slice(0, 150))
    } catch (e) {
      console.warn('[audit] فشل تحميل السجل:', e.message)
    } finally {
      setLoading(false)
    }
  }

  // قائمة المستخدمين الفريدة الظاهرة في السجل الحالي (لتعبئة فلتر "كل المستخدمين")
  const actorOptions = [...new Map(logs.map(l => [l.actor_name, l.actor_name])).keys()]
    .filter(Boolean).sort().map(name => ({ value: name, label: name }))

  const filtered = logs.filter(l => {
    if (actionFil && l.action !== actionFil) return false
    if (actorFil && l.actor_name !== actorFil) return false
    if (search && !l.family_name?.includes(search)) return false
    return true
  })

  function formatTime(t) {
    if (!t) return '—'
    return new Date(t).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
  }

  function renderChanges(changes) {
    const keys = Object.keys(changes || {})
    if (!keys.length) return null
    return (
      <div className="mt-2 pt-2 border-t border-border flex flex-col gap-1">
        {keys.map(k => (
          <div key={k} className="text-[11px] text-muted flex gap-1 flex-wrap">
            <span className="font-bold text-white">{TRACKED_FIELDS[k] || k}:</span>
            <span className="line-through opacity-60">{changes[k].old ?? '—'}</span>
            <span>←</span>
            <span className="text-accent">{changes[k].new ?? '—'}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <PageHeader icon="📝" title="سجل التغييرات" subtitle="آخر 150 عملية حقيقية على الأسر"/>

      <div className="flex flex-col gap-2 mb-3">
        <SearchBar value={search} onChange={setSearch} placeholder="بحث باسم رب الأسرة..."/>
        <div className="flex gap-2">
          <FilterSelect value={actionFil} onChange={setActionFil} className="flex-1"
            placeholder="كل الإجراءات"
            options={[
              { value: 'insert', label: '➕ إضافة' },
              { value: 'update', label: '✏️ تعديل' },
              { value: 'delete', label: '🗑️ حذف'  },
            ]}/>
          <FilterSelect value={actorFil} onChange={setActorFil} className="flex-1"
            placeholder="كل المستخدمين"
            options={actorOptions}/>
        </div>
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
            const op = OP_STYLE[l.action] || OP_STYLE.update
            const isOpen = expanded === l.id
            const hasChanges = l.changes && Object.keys(l.changes).length > 0
            return (
              <div key={l.id} className="bg-surface border border-border rounded-xl p-3"
                onClick={() => hasChanges && setExpanded(isOpen ? null : l.id)}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${op.color} ${op.bg}`}>
                    {op.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-bold truncate">{l.family_name || '—'}</div>
                    <div className="text-muted text-[10px]">👤 {l.actor_name || '—'}</div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className="text-muted text-[10px]">{formatTime(l.created_at)}</span>
                    {hasChanges && <span className="text-accent text-[10px]">{isOpen ? '▲' : `▼ ${Object.keys(l.changes).length} تغيير`}</span>}
                  </div>
                </div>
                {isOpen && renderChanges(l.changes)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
