
import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SearchBar from '../../components/ui/SearchBar'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const STATUS_MAP = {
  draft: { label: 'مسودة', color: 'muted' },
  active: { label: 'نشط', color: 'green' },
  completed: { label: 'مكتمل', color: 'blue' },
  cancelled: { label: 'ملغي', color: 'red' },
}

export default function Distributions() {
  const [rounds, setRounds] = useState([])
  const [camps, setCamps]   = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', camp_id: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const { showToast, online } = useApp()
  const { isSuperAdmin, isOwner, canWrite } = useAuth()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const campsData = await localDB.camps.toArray().catch(() => [])
      setCamps(Object.fromEntries(campsData.map(c => [c.id, c.name])))
      if (online) {
        const { data, error } = await supabase.from('dist_rounds').select('*').eq('org_id', ORG_ID).order('created_at', { ascending: false })
        if (!error && data) {
          try { await localDB.dist_rounds.bulkPut(data) } catch {}
          setRounds(data)
        }
      } else {
        const local = await localDB.dist_rounds.toArray().catch(() => [])
        setRounds(local.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)))
      }
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim()) return showToast('اسم الجولة مطلوب', true)
    setSaving(true)
    try {
      const data = { id: crypto.randomUUID(), org_id: ORG_ID, name: form.name.trim(), camp_id: form.camp_id || null, notes: form.notes || null, status: 'draft', created_at: new Date().toISOString() }
      await localDB.dist_rounds.put(data)
      if (online) { const { error } = await supabase.from('dist_rounds').insert(data); if (error) throw error }
      showToast('✅ تمت إضافة الجولة')
      setShowAdd(false); setForm({ name: '', camp_id: '', notes: '' }); await loadData()
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  async function updateStatus(id, status) {
    try {
      await localDB.dist_rounds.update(id, { status })
      if (online) await supabase.from('dist_rounds').update({ status }).eq('id', id)
      setRounds(r => r.map(x => x.id === id ? { ...x, status } : x))
      setSelected(s => s ? { ...s, status } : null)
      showToast('✅ تم التحديث')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
  }

  const campsList = Object.entries(camps).map(([id, name]) => ({ id, name }))
  const filtered = rounds.filter(r => !search || (r.name||'').toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <PageHeader icon="📦" title="التوزيعات" subtitle={`${rounds.length} جولة`}
        action={canWrite && (
          <button onClick={() => setShowAdd(true)} className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      <div className="grid grid-cols-4 gap-2 mb-4">
        {Object.entries(STATUS_MAP).map(([k,v]) => (
          <div key={k} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className={`text-lg font-black text-${v.color}`}>{rounds.filter(r=>r.status===k).length}</div>
            <div className="text-muted text-[9px] mt-0.5">{v.label}</div>
          </div>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="بحث في الجولات..." />

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : filtered.length === 0 ? <EmptyState icon="📦" title="لا توجد جولات توزيع" />
      : (
        <div className="flex flex-col gap-2">
          {filtered.map(round => (
            <div key={round.id} onClick={() => setSelected(round)}
              className="bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-accent/40 active:scale-98 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-white text-sm">{round.name}</div>
                  {round.camp_id && camps[round.camp_id] && <div className="text-muted text-xs mt-0.5">🏕️ {camps[round.camp_id]}</div>}
                  <div className="text-muted text-xs mt-0.5">📅 {formatDate(round.created_at)}</div>
                </div>
                <Badge color={STATUS_MAP[round.status]?.color || 'muted'}>{STATUS_MAP[round.status]?.label || round.status}</Badge>
              </div>
              {round.notes && <div className="text-muted text-xs mt-2 bg-surface2 rounded-lg p-2">{round.notes}</div>}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="تفاصيل الجولة">
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {[['الاسم', selected.name], ['الحالة', STATUS_MAP[selected.status]?.label], ['المخيم', camps[selected.camp_id]||'—'], ['التاريخ', formatDate(selected.created_at)]].map(([k,v]) => (
                <div key={k} className="bg-surface2 rounded-xl p-3">
                  <div className="text-muted text-[10px]">{k}</div>
                  <div className="text-white font-bold text-xs mt-0.5">{v||'—'}</div>
                </div>
              ))}
            </div>
            {selected.notes && <p className="text-muted text-xs bg-surface2 rounded-xl p-3">{selected.notes}</p>}
            {(isOwner || isSuperAdmin) && selected.status === 'draft' && (
              <button onClick={() => updateStatus(selected.id, 'active')}
                className="w-full bg-green/15 border border-green/30 text-green font-bold py-2.5 rounded-xl text-sm">
                ▶️ تفعيل الجولة
              </button>
            )}
            {(isOwner || isSuperAdmin) && selected.status === 'active' && (
              <button onClick={() => updateStatus(selected.id, 'completed')}
                className="w-full bg-blue/15 border border-blue/30 text-blue font-bold py-2.5 rounded-xl text-sm">
                ✅ إتمام الجولة
              </button>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="➕ إضافة جولة توزيع">
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">اسم الجولة *</label>
            <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="توزيع رمضان 2025"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">المخيم</label>
            <select value={form.camp_id} onChange={e => setForm(f=>({...f,camp_id:e.target.value}))}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
              <option value="">— كل المخيمات —</option>
              {campsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} rows={2}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : '✅ إضافة الجولة'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
