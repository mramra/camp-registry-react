import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../lib/utils'
import { supabase, ORG_ID } from '../../lib/supabase'
import PageHeader from '../../components/ui/PageHeader'
import SearchBar from '../../components/ui/SearchBar'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'

const STATUS_MAP = {
  active:   { label: 'نشط',    color: 'green'  },
  inactive: { label: 'غير نشط', color: 'muted'  },
  pending:  { label: 'معلق',   color: 'accent' },
  departed: { label: 'مغادر',  color: 'red'    },
  urgent:   { label: 'عاجل',   color: 'red'    },
}

export default function FamiliesList() {
  const [families, setFamilies] = useState([])
  const [camps,    setCamps]    = useState({})
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [selected, setSelected] = useState(null)
  const { canWrite, canDelete } = useAuth()
  const { showToast, online }   = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      if (online) {
        const { data, error } = await supabase
          .from('families')
          .select('id, head_name, head_id, camp_id, phone1, status, created_at, members_count')
          .eq('org_id', ORG_ID)
          .order('created_at', { ascending: false })
        if (error) { console.error('supabase families:', error); showToast('خطأ السيرفر: ' + error.message, true) }
        else if (data) {
          try { await localDB.families.bulkPut(data) } catch {}
          setFamilies(data)
        }
      }
      const localFams = await localDB.families.toArray().catch(() => [])
      if (!online) setFamilies(localFams.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)))
      const campData = await localDB.camps.toArray().catch(() => [])
      setCamps(Object.fromEntries(campData.map(c => [c.id, c.name])))
    } catch (err) {
      console.error('loadData families:', err)
      showToast('خطأ: ' + (err?.message || String(err)), true)
    } finally { setLoading(false) }
  }

  async function deleteFamily(id) {
    if (!window.confirm('حذف هذه الأسرة؟')) return
    try {
      await localDB.families.delete(id)
      if (online) await supabase.from('families').delete().eq('id', id)
      setFamilies(f => f.filter(x => x.id !== id))
      setSelected(null)
      showToast('تم الحذف')
    } catch { showToast('فشل الحذف', true) }
  }

  const filtered = families.filter(f => {
    if (filter !== 'all' && f.status !== filter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (f.head_name || '').toLowerCase().includes(q) ||
           (f.head_id   || '').includes(q) ||
           (f.phone1    || '').includes(q)
  })

  const statusCounts = families.reduce((acc, f) => {
    acc[f.status] = (acc[f.status] || 0) + 1; return acc
  }, {})

  return (
    <div>
      <PageHeader icon="👨‍👩‍👧‍👦" title="قائمة الأسر" subtitle={`${families.length} أسرة`}
        action={canWrite && (
          <button onClick={() => navigate('/families/add')}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      {/* فلاتر الحالة */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {[
          { key:'all',      label:`الكل (${families.length})` },
          { key:'active',   label:`نشط (${statusCounts.active||0})` },
          { key:'urgent',   label:`عاجل (${statusCounts.urgent||0})` },
          { key:'inactive', label:`غير نشط (${statusCounts.inactive||0})` },
          { key:'departed', label:`مغادر (${statusCounts.departed||0})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all
              ${filter === f.key ? 'bg-accent text-bg border-accent' : 'bg-surface2 border-border text-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="بحث بالاسم أو الهوية أو الجوال..." />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👨‍👩‍👧‍👦" title="لا توجد أسر"
          subtitle={search ? 'لا نتائج للبحث' : 'ابدأ بإضافة أسرة'}
          action={canWrite && !search && (
            <button onClick={() => navigate('/families/add')}
              className="bg-accent text-bg font-black px-5 py-2.5 rounded-xl text-sm mt-2">إضافة أسرة</button>
          )}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(family => (
            <div key={family.id} onClick={() => setSelected(family)}
              className="bg-surface border border-border rounded-xl p-4 active:scale-98 transition-all cursor-pointer hover:border-accent/40">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm mb-1 truncate">{family.head_name || '—'}</div>
                  <div className="text-muted text-xs">🪪 {family.head_id}</div>
                  {family.camp_id && camps[family.camp_id] && (
                    <div className="text-muted text-xs mt-0.5">🏕️ {camps[family.camp_id]}</div>
                  )}
                  {family.phone1 && <div className="text-muted text-xs mt-0.5">📞 {family.phone1}</div>}
                </div>
                <div className="flex flex-col items-end gap-1.5 mr-2">
                  <Badge color={STATUS_MAP[family.status]?.color || 'muted'}>
                    {STATUS_MAP[family.status]?.label || family.status}
                  </Badge>
                  {family.members_count > 0 && (
                    <span className="text-muted text-[10px]">{family.members_count} فرد</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* نافذة التفاصيل */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="تفاصيل الأسرة">
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['اسم رب الأسرة', selected.head_name],
                ['رقم الهوية',    selected.head_id],
                ['الجوال',        selected.phone1],
                ['المخيم',        camps[selected.camp_id] || '—'],
                ['الحالة',        STATUS_MAP[selected.status]?.label || selected.status],
                ['تاريخ التسجيل', formatDate(selected.created_at)],
              ].map(([k,v]) => (
                <div key={k} className="bg-surface2 rounded-xl p-3">
                  <div className="text-muted text-[10px] mb-0.5">{k}</div>
                  <div className="text-white font-bold text-xs">{v || '—'}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => { navigate(`/families/edit/${selected.id}`); setSelected(null) }}
                className="flex-1 bg-accent text-bg font-black py-2.5 rounded-xl text-sm">✏️ تعديل</button>
              {canDelete && (
                <button onClick={() => deleteFamily(selected.id)}
                  className="flex-1 bg-red/15 border border-red/40 text-red font-bold py-2.5 rounded-xl text-sm">🗑️ حذف</button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
