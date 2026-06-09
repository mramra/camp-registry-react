
import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/utils'
import { enqueue } from '../../lib/sync'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SearchBar from '../../components/ui/SearchBar'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const TYPE_MAP = {
  transfer: { label: 'نقل بين مخيمات', color: 'blue', icon: '🔄' },
  arrival: { label: 'وصول جديد', color: 'green', icon: '📥' },
  departure: { label: 'مغادرة', color: 'red', icon: '📤' },
  return: { label: 'عودة', color: 'accent', icon: '↩️' },
}

export default function Movements() {
  const [movements, setMovements] = useState([])
  const [families, setFamilies] = useState({})
  const [camps, setCamps] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ family_id: '', type: 'transfer', from_camp_id: '', to_camp_id: '', notes: '', date: new Date().toISOString().slice(0,10) })
  const [saving, setSaving] = useState(false)
  const { showToast, online } = useApp()
  const { canWrite } = useAuth()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [familiesData, campsData] = await Promise.all([
        localDB.families.toArray().catch(() => []),
        localDB.camps.toArray().catch(() => [])
      ])
      setFamilies(Object.fromEntries(familiesData.map(f => [f.id, f.head_name])))
      setCamps(Object.fromEntries(campsData.map(c => [c.id, c.name])))
      if (online) {
        const { data, error } = await supabase.from('family_movements').select('*').eq('org_id', ORG_ID).order('date', { ascending: false }).limit(200)
        if (!error && data) {
          try { await localDB.family_movements.bulkPut(data) } catch {}
          setMovements(data)
        }
      } else {
        const local = await localDB.family_movements.toArray().catch(() => [])
        setMovements(local.sort((a,b) => new Date(b.date) - new Date(a.date)))
      }
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.family_id) return showToast('اختر الأسرة', true)
    if (!form.type) return showToast('اختر نوع الحركة', true)
    setSaving(true)
    try {
      const data = { id: crypto.randomUUID(), org_id: ORG_ID, family_id: form.family_id, type: form.type, from_camp_id: form.from_camp_id || null, to_camp_id: form.to_camp_id || null, notes: form.notes || null, date: form.date || new Date().toISOString().slice(0,10), created_at: new Date().toISOString() }
      await localDB.family_movements.put(data)
      await enqueue('insert_movement', data)
      if (online) { const { error } = await supabase.from('family_movements').insert(data); if (error) throw error }
      showToast('✅ تمت إضافة الحركة')
      setShowAdd(false); await loadData()
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  const familiesList = Object.entries(families).map(([id, name]) => ({ id, name }))
  const campsList = Object.entries(camps).map(([id, name]) => ({ id, name }))
  const filtered = movements.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return (families[m.family_id]||'').toLowerCase().includes(q) || (TYPE_MAP[m.type]?.label||'').includes(q)
  })

  return (
    <div>
      <PageHeader icon="🔄" title="حركات الأسر" subtitle={`${movements.length} حركة`}
        action={canWrite && <button onClick={() => setShowAdd(true)} className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>}
      />

      <div className="grid grid-cols-4 gap-2 mb-4">
        {Object.entries(TYPE_MAP).map(([k,v]) => (
          <div key={k} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className="text-base mb-0.5">{v.icon}</div>
            <div className={`text-sm font-black text-${v.color}`}>{movements.filter(m=>m.type===k).length}</div>
          </div>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="بحث في الحركات..." />

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : filtered.length === 0 ? <EmptyState icon="🔄" title="لا توجد حركات" />
      : (
        <div className="flex flex-col gap-2">
          {filtered.map(m => {
            const t = TYPE_MAP[m.type] || { label: m.type, color: 'muted', icon: '🔄' }
            return (
              <div key={m.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span>{t.icon}</span>
                      <span className="font-bold text-white text-sm">{families[m.family_id] || 'أسرة غير معروفة'}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted flex-wrap">
                      {m.from_camp_id && camps[m.from_camp_id] && <span>من: {camps[m.from_camp_id]}</span>}
                      {m.to_camp_id && camps[m.to_camp_id] && <span>إلى: {camps[m.to_camp_id]}</span>}
                      <span>📅 {formatDate(m.date)}</span>
                    </div>
                    {m.notes && <div className="text-muted text-xs mt-1.5 bg-surface2 rounded-lg px-2 py-1">{m.notes}</div>}
                  </div>
                  <Badge color={t.color}>{t.label}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="➕ إضافة حركة أسرة" size="lg">
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">الأسرة *</label>
            <select value={form.family_id} onChange={e => setForm(f=>({...f,family_id:e.target.value}))}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
              <option value="">— اختر الأسرة —</option>
              {familiesList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">نوع الحركة *</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPE_MAP).map(([k,v]) => (
                <button key={k} type="button" onClick={() => setForm(f=>({...f,type:k}))}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${form.type===k ? 'bg-accent/15 text-accent border-accent' : 'bg-surface2 border-border text-muted'}`}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>
          {(form.type === 'transfer' || form.type === 'departure') && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">من مخيم</label>
              <select value={form.from_camp_id} onChange={e => setForm(f=>({...f,from_camp_id:e.target.value}))}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر —</option>
                {campsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {(form.type === 'transfer' || form.type === 'arrival' || form.type === 'return') && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">إلى مخيم</label>
              <select value={form.to_camp_id} onChange={e => setForm(f=>({...f,to_camp_id:e.target.value}))}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر —</option>
                {campsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">التاريخ</label>
            <input type="date" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))} dir="ltr"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} rows={2}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : '✅ إضافة الحركة'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
