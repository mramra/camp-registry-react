import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useRxDB } from '../../lib/useRxDB'
import { enqueue } from '../../lib/sync'
import { useAuth } from '../../context/AuthContext'
import { useDataScope } from '../../lib/useDataScope'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const TYPE_MAP = {
  entry:    { label:'🟢 دخول',  color:'#10b981' },
  exit:     { label:'🔴 خروج', color:'#ef4444' },
  transfer: { label:'🔵 نقل',  color:'#3b82f6' },
}

export default function Movements() {
  const [movements,  setMovements]  = useState([])
  const [camps,      setCamps]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterCamp, setFilterCamp] = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [families,   setFamilies]   = useState([])
  const [search,     setSearch]     = useState('')
  const [form,       setForm]       = useState({ family_id:'', type:'entry', from_camp:'', to_camp:'', date: new Date().toISOString().split('T')[0], reason:'', notes:'' })
  const [saving,     setSaving]     = useState(false)

  const { canWrite } = useAuth()
  const { getAllowedCampIds, applyScope, filterLocal } = useDataScope()
  const { query, upsert, remove, bulkUpsert } = useRxDB()
  const { showToast, psReady, psSynced} = useApp()

  useEffect(() => { loadData() }, [filterType, filterCamp])
  useEffect(() => { loadData() }, [])
  useEffect(() => { if (psReady)  loadData() }, [psReady])
  useEffect(() => { if (psSynced) loadData() }, [psSynced])

  async function loadData() {
    setLoading(true)
    try {
      // مخيمات
      const lCamps = await query('camps')
      setCamps(lCamps)

      // حركات — Dexie أولاً
      let movs = await query('family_movements', {org_id: ORG_ID})
      movs.sort((a,b) => (b.date||'').localeCompare(a.date||''))
      const campIds = getAllowedCampIds(camps)
      if (campIds !== null && campIds.length > 0 && !filterCamp) {
        const cSet = new Set(campIds)
        movs = movs.filter(m => cSet.has(m.from_camp) || cSet.has(m.to_camp))
      }
      if (filterType) movs = movs.filter(m => m.type === filterType)
      if (filterCamp) movs = movs.filter(m => m.from_camp===filterCamp || m.to_camp===filterCamp)
      setMovements(movs.slice(0,100))
      setLoading(false)

      // ثم Supabase
      if (!navigator.onLine) return
      // campIds مُعرَّفة مسبقاً أعلاه
      let q = supabase.from('family_movements')
        .select('*, families(head_name,head_id)')
        .eq('org_id', ORG_ID)
        .order('date', { ascending: false }).limit(200)
      if (filterType) q = q.eq('type', filterType)
      if (filterCamp) q = q.or(`from_camp.eq.${filterCamp},to_camp.eq.${filterCamp}`)
      else if (campIds !== null && campIds.length > 0) {
        q = q.or(campIds.map(id=>`from_camp.eq.${id}`).concat(campIds.map(id=>`to_camp.eq.${id}`)).join(','))
      }
      const { data } = await q
      if (data) {
        try { await localDB.family_movements.bulkPut(data.map(m=>({...m, family_name:m.families?.head_name}))) } catch {}
        let filtered = data
        if (filterType) filtered = filtered.filter(m => m.type===filterType)
        if (filterCamp) filtered = filtered.filter(m => m.from_camp===filterCamp||m.to_camp===filterCamp)
        setMovements(filtered.slice(0,100))
      }
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function loadFamilies() {
    const fams = await localDB.families.toArray().catch(()=>[])
    setFamilies(fams)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.family_id) return showToast('اختر أسرة', true)
    if (!form.date)       return showToast('التاريخ مطلوب', true)
    setSaving(true)
    try {
      const data = {
        id:         crypto.randomUUID(),
        org_id:     ORG_ID,
        family_id:  form.family_id,
        type:       form.type,
        from_camp:  form.from_camp || null,
        to_camp:    form.to_camp   || null,
        date:       form.date,
        reason:     form.reason    || null,
        notes:      form.notes     || null,
        created_at: new Date().toISOString(),
      }
      await localDB.family_movements.put(data)
      await enqueue('insert_movement', data)
      showToast('✅ تم تسجيل الحركة')
      setShowForm(false)
      await loadData()
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))

  const stats = { entry:0, exit:0, transfer:0 }
  movements.forEach(m => { if(stats[m.type]!==undefined) stats[m.type]++ })

  const filteredFams = families.filter(f =>
    !search || (f.head_name||'').toLowerCase().includes(search.toLowerCase()) || (f.head_id||'').includes(search)
  )

  return (
    <div>
      <PageHeader icon="🚶" title="حركات الأسر"
        subtitle={<span className="text-muted text-xs">{movements.length} حركة</span>}
        action={canWrite && (
          <button onClick={()=>{ loadFamilies(); setShowForm(true) }}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">➕ تسجيل</button>
        )}
      />

      {/* إحصائيات */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {Object.entries(TYPE_MAP).map(([k,v]) => (
          <div key={k} className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-xl font-black" style={{color:v.color}}>{stats[k]||0}</div>
            <div className="text-muted text-[10px] mt-0.5">{v.label}</div>
          </div>
        ))}
      </div>

      {/* الفلاتر */}
      <div className="flex gap-2 mb-3">
        <select value={filterType} onChange={e=>setFilterType(e.target.value)}
          className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-accent">
          <option value="">كل الأنواع</option>
          {Object.entries(TYPE_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)}
          className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-accent">
          <option value="">كل المخيمات</option>
          {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : movements.length === 0 ? <EmptyState icon="🚶" title="لا توجد حركات" />
      : (
        <div className="flex flex-col gap-2">
          {movements.map(m => {
            const t = TYPE_MAP[m.type] || { label:m.type, color:'#6b7280' }
            return (
              <div key={m.id} className="bg-surface border border-border rounded-xl p-3"
                style={{borderRight:`4px solid ${t.color}`}}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm">{m.families?.head_name || m.family_name || '—'}</div>
                    {(m.families?.head_id) && <div className="text-muted text-[10px]" dir="ltr">{m.families.head_id}</div>}
                    <div className="flex gap-3 mt-1 flex-wrap">
                      {m.from_camp && <span className="text-muted text-[10px]">📤 {campMap[m.from_camp]||'—'}</span>}
                      {m.to_camp   && <span className="text-muted text-[10px]">📥 {campMap[m.to_camp]||'—'}</span>}
                      {m.reason    && <span className="text-muted text-[10px]">• {m.reason}</span>}
                    </div>
                    {m.notes && <div className="text-muted text-[10px] mt-1">{m.notes}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{background:`${t.color}22`,color:t.color}}>{t.label}</span>
                    <span className="text-muted text-[10px]">{m.date}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* فورم التسجيل */}
      <Modal open={showForm} onClose={()=>setShowForm(false)} title="➕ تسجيل حركة">
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">بحث عن أسرة</label>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="اسم رب الأسرة أو رقم الهوية..."
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent mb-2"/>
            <select value={form.family_id} onChange={e=>setForm(f=>({...f,family_id:e.target.value}))}
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
              <option value="">— اختر أسرة —</option>
              {filteredFams.slice(0,50).map(f=><option key={f.id} value={f.id}>{f.head_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">نوع الحركة</label>
            <div className="flex gap-2">
              {Object.entries(TYPE_MAP).map(([k,v]) => (
                <button type="button" key={k} onClick={()=>setForm(f=>({...f,type:k}))}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all"
                  style={{
                    background: form.type===k ? `${v.color}22` : 'transparent',
                    borderColor: form.type===k ? v.color : '#374151',
                    color: form.type===k ? v.color : '#9ca3af'
                  }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {(form.type==='exit'||form.type==='transfer') && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">من مخيم</label>
              <select value={form.from_camp} onChange={e=>setForm(f=>({...f,from_camp:e.target.value}))}
                className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر —</option>
                {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {(form.type==='entry'||form.type==='transfer') && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">إلى مخيم</label>
              <select value={form.to_camp} onChange={e=>setForm(f=>({...f,to_camp:e.target.value}))}
                className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر —</option>
                {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">التاريخ</label>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">السبب</label>
            <input value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}
              placeholder="سبب الحركة..."
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">ملاحظات</label>
            <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
              rows={2} className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none"/>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : '✅ تسجيل'}
            </button>
            <button type="button" onClick={()=>setShowForm(false)}
              className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
