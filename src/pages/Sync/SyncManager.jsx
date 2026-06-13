import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { getDB, startSync, pushToPostgres } from '../../lib/rxdb'
import { supabase, ORG_ID } from '../../lib/supabase'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { Navigate } from 'react-router-dom'

const COLLECTIONS = [
  { key: 'families',           table: 'families',           label: 'الأسر',           icon: '👨‍👩‍👧' },
  { key: 'family_members',     table: 'family_members',     label: 'الأفراد',          icon: '👤' },
  { key: 'camps',              table: 'camps',              label: 'المخيمات',         icon: '🏕️' },
  { key: 'org_members',        table: 'org_members',        label: 'المستخدمون',       icon: '👥' },
  { key: 'family_movements',   table: 'family_movements',   label: 'الحركات',          icon: '🔄' },
  { key: 'dist_rounds',        table: 'dist_rounds',        label: 'جولات التوزيع',    icon: '📦' },
  { key: 'camp_dist_families', table: 'camp_dist_families', label: 'استلام التوزيعات', icon: '✅' },
]

export default function SyncManager() {
  const { isOwner } = useAuth()
  const { showToast, online } = useApp()
  const [stats,     setStats]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [syncing,   setSyncing]   = useState(false)
  const [pushing,   setPushing]   = useState(false)
  const [clearing,  setClearing]  = useState(false)
  const [syncLog,   setSyncLog]   = useState([])
  const [activeTab, setActiveTab] = useState('status')
  const [selected,  setSelected]  = useState(null)
  const [diffId,    setDiffId]    = useState('')
  const [diffResult,setDiffResult]= useState(null)

  if (!isOwner) return <Navigate to="/" replace />

  const log = useCallback((msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('ar')
    setSyncLog(prev => [{ time, msg, type }, ...prev].slice(0, 100))
  }, [])

  const loadStats = useCallback(async () => {
    setLoading(true)
    const db = await getDB()
    const result = []
    for (const col of COLLECTIONS) {
      try {
        const localDocs = await db[col.key]?.find().exec().catch(() => []) || []
        const localCount = localDocs.length
        const sorted = [...localDocs].sort((a,b) => (b.updated_at||'').localeCompare(a.updated_at||''))
        const lastLocal = sorted[0]?.updated_at?.slice(0,16) || '—'
        let remoteCount = 0, lastRemote = '—'
        if (online) {
          const { count, data } = await supabase.from(col.table)
            .select('updated_at', { count:'exact' }).order('updated_at',{ascending:false}).limit(1)
          remoteCount = count || 0
          lastRemote = data?.[0]?.updated_at?.slice(0,16) || '—'
        }
        const diff = Math.abs(localCount - remoteCount)
        result.push({ ...col, localCount, lastLocal, remoteCount, lastRemote,
          inSync: online ? diff===0 : null, diff })
      } catch(e) {
        result.push({ ...col, localCount:0, remoteCount:0, diff:0, error:e.message })
      }
    }
    setStats({ collections: result, lastSync: localStorage.getItem('rxdb_last_sync') })
    setLoading(false)
  }, [online])

  useEffect(() => { loadStats() }, [])

  const pullAll = async () => {
    if (!online) return showToast('لا يوجد اتصال', true)
    setSyncing(true)
    log('🔄 سحب كامل من PostgreSQL...','info')
    try {
      localStorage.removeItem('rxdb_last_sync')
      const db = await getDB()
      await startSync(db)
      log('✅ اكتمل السحب','success')
      showToast('✅ تم السحب الكامل')
      await loadStats()
    } catch(e) { log(`❌ ${e.message}`,'error'); showToast(e.message,true) }
    setSyncing(false)
  }

  const pushAll = async () => {
    if (!online) return showToast('لا يوجد اتصال', true)
    setPushing(true)
    log('⬆️ دفع المحلي لـ PostgreSQL...','info')
    let total=0, errors=0
    const db = await getDB()
    for (const col of COLLECTIONS) {
      try {
        const docs = (await db[col.key]?.find().exec().catch(()=>[]) || []).map(d=>d.toJSON())
        if (!docs.length) continue
        log(`  📤 ${col.label}: ${docs.length} سجل`,'info')
        const ok = await pushToPostgres(col.table,'upsert',docs)
        if (ok) total += docs.length; else { errors++; log(`  ❌ ${col.label}`,'error') }
      } catch(e) { errors++; log(`  ❌ ${col.label}: ${e.message}`,'error') }
    }
    log(`${errors>0?'⚠️':'✅'} تم: ${total} سجل، ${errors} خطأ`, errors>0?'warning':'success')
    showToast(errors>0?`⚠️ ${total} نجح، ${errors} فشل`:`✅ دُفع ${total} سجل`)
    setPushing(false)
    await loadStats()
  }

  const resetLocal = async (key) => {
    if (!window.confirm(`مسح ${key==='all'?'كل البيانات':key} المحلية؟`)) return
    setClearing(true)
    const db = await getDB()
    try {
      if (key === 'all') {
        for (const col of COLLECTIONS) {
          const docs = await db[col.key]?.find().exec().catch(()=>[]) || []
          await Promise.all(docs.map(d=>d.remove()))
        }
        localStorage.removeItem('rxdb_last_sync')
        log('🗑️ تم مسح كل البيانات المحلية','warning')
        showToast('✅ تم المسح — سيُزامَن تلقائياً')
        if (online) { await startSync(db); log('✅ أُعيد السحب من PostgreSQL','success') }
      } else {
        const docs = await db[key]?.find().exec().catch(()=>[]) || []
        await Promise.all(docs.map(d=>d.remove()))
        log(`🗑️ مُسح ${docs.length} من ${key}`,'warning')
        if (online) { await startSync(db); log(`✅ أُعيد سحب ${key}`,'success') }
      }
      await loadStats()
    } catch(e) { log(`❌ ${e.message}`,'error') }
    setClearing(false)
  }

  const diagnose = async () => {
    log('🔍 تشخيص...','info')
    const { error } = await supabase.from('camps').select('count',{count:'exact',head:true})
    log(error ? `❌ Supabase: ${error.message}` : '✅ Supabase PostgreSQL متصل', error?'error':'success')
    try {
      const db = await getDB()
      const c = await db.families.count().exec()
      log(`✅ RxDB محلي: ${c} أسرة`,'success')
    } catch(e) { log(`❌ RxDB: ${e.message}`,'error') }
    log(`📶 ${online?'متصل':'أوف لاين'}`, online?'success':'warning')
    log(`⏰ آخر sync: ${localStorage.getItem('rxdb_last_sync')||'لم يتم'}`,'info')
  }

  const compareSingle = async () => {
    if (!diffId.trim()) return
    setDiffResult(null)
    const db = await getDB()
    for (const col of COLLECTIONS) {
      const local = await db[col.key]?.findOne(diffId.trim()).exec().catch(()=>null)
      if (local) {
        const {data:remote} = await supabase.from(col.table).select('*').eq('id',diffId.trim()).single()
        setDiffResult({ label:col.label, local:local.toJSON(), remote })
        return
      }
    }
    setDiffResult({ error:'لم يُوجد السجل' })
  }

  const TABS = [
    {key:'status', label:'📊 الحالة'},
    {key:'tools',  label:'🔧 الأدوات'},
    {key:'diff',   label:'🔍 مقارنة'},
    {key:'log',    label:'📋 السجل'},
  ]

  const bgStatus = col =>
    !online ? 'rgba(55,65,81,0.3)' :
    col.error ? 'rgba(239,68,68,0.1)' :
    col.inSync ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'

  return (
    <div>
      <PageHeader icon="🛠️" title="إدارة البيانات والمزامنة" />

      {/* شريط الحالة */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <span className={`text-xs px-3 py-1.5 rounded-xl font-bold ${online?'bg-green/10 text-green':'bg-red/10 text-red'}`}>
          {online?'🟢 متصل':'🔴 أوف لاين'}
        </span>
        {stats?.lastSync && (
          <span className="text-xs px-3 py-1.5 rounded-xl bg-surface2 text-muted">
            ⏰ {new Date(stats.lastSync).toLocaleTimeString('ar')}
          </span>
        )}
        <button onClick={loadStats} disabled={loading}
          className="text-xs px-3 py-1.5 rounded-xl bg-surface2 text-muted font-bold">
          {loading?'⏳':'🔄 تحديث'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border
              ${activeTab===t.key?'bg-accent text-bg border-accent':'bg-surface2 border-border text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ حالة ══ */}
      {activeTab==='status' && (
        <div className="flex flex-col gap-2">
          {loading
            ? <div className="flex justify-center py-8"><Spinner/></div>
            : stats?.collections.map(col=>(
              <div key={col.key} onClick={()=>setSelected(selected===col.key?null:col.key)}
                className="rounded-xl p-3 border border-border cursor-pointer"
                style={{background:bgStatus(col)}}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{col.icon}</span>
                    <span className="text-white text-sm font-bold">{col.label}</span>
                  </div>
                  {online && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg
                      ${col.error?'bg-red/20 text-red':col.inSync?'bg-green/20 text-green':'bg-accent/20 text-accent'}`}>
                      {col.error?'❌':col.inSync?`✅ متزامن`:`⚠️ فرق ${col.diff}`}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-black/20 rounded-lg p-2">
                    <div className="text-[9px] text-muted">📱 محلي</div>
                    <div className="text-white text-base font-black">{col.localCount}</div>
                    <div className="text-[9px] text-muted">{col.lastLocal}</div>
                  </div>
                  <div className="bg-black/20 rounded-lg p-2">
                    <div className="text-[9px] text-muted">☁️ PostgreSQL</div>
                    <div className="text-white text-base font-black">{online?col.remoteCount:'—'}</div>
                    <div className="text-[9px] text-muted">{online?col.lastRemote:'أوف لاين'}</div>
                  </div>
                </div>
                {selected===col.key && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={e=>{e.stopPropagation();resetLocal(col.key)}} disabled={clearing}
                      className="flex-1 py-1.5 text-[11px] font-bold rounded-lg border border-red/40 text-red"
                      style={{background:'rgba(239,68,68,0.08)'}}>
                      🗑️ مسح وإعادة سحب
                    </button>
                    <button onClick={async e=>{
                      e.stopPropagation()
                      const db=await getDB()
                      const docs=(await db[col.key]?.find().exec()||[]).map(d=>d.toJSON())
                      await pushToPostgres(col.table,'upsert',docs)
                      log(`⬆️ ${col.label}: ${docs.length} سجل`,'success')
                      showToast(`✅ ${docs.length} سجل`)
                    }}
                      className="flex-1 py-1.5 text-[11px] font-bold rounded-lg border border-blue/40 text-blue"
                      style={{background:'rgba(59,130,246,0.08)'}}>
                      ⬆️ دفع لـ PostgreSQL
                    </button>
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}

      {/* ══ أدوات ══ */}
      {activeTab==='tools' && (
        <div className="flex flex-col gap-3">
          <Card title="⬇️ سحب كامل من PostgreSQL" icon="">
            <p className="text-muted text-xs mb-3">يجلب كل البيانات من Supabase ويُحدّث RxDB المحلي</p>
            <button onClick={pullAll} disabled={syncing||!online}
              className="w-full py-3 rounded-xl font-black text-sm"
              style={{background:online?'#f59e0b':'#374151',color:online?'#0d1117':'#9ca3af'}}>
              {syncing?'⏳ جارٍ السحب...':'⬇️ سحب كامل'}
            </button>
            {!online&&<p className="text-red text-xs text-center mt-1">يحتاج اتصال</p>}
          </Card>

          <Card title="⬆️ دفع المحلي لـ PostgreSQL" icon="">
            <p className="text-muted text-xs mb-3">يرفع كل ما في RxDB لـ Supabase (للطوارئ)</p>
            <button onClick={pushAll} disabled={pushing||!online}
              className="w-full py-3 rounded-xl font-bold text-sm border border-blue/40 text-blue"
              style={{background:'rgba(59,130,246,0.08)'}}>
              {pushing?'⏳ جارٍ الدفع...':'⬆️ دفع الكل'}
            </button>
          </Card>

          <Card title="🔍 تشخيص الاتصال" icon="">
            <button onClick={diagnose}
              className="w-full py-3 rounded-xl font-bold text-sm border border-green/40 text-green"
              style={{background:'rgba(16,185,129,0.08)'}}>
              🔍 تشخيص الآن
            </button>
          </Card>

          <Card title="⚠️ إعادة ضبط المحلي" icon="">
            <p className="text-red text-xs mb-3">⚠️ تحذير: ستُفقد البيانات غير المزامَنة</p>
            <button onClick={()=>resetLocal('all')} disabled={clearing}
              className="w-full py-3 rounded-xl font-bold text-sm border border-red/40 text-red"
              style={{background:'rgba(239,68,68,0.08)'}}>
              {clearing?'⏳...':'🗑️ مسح كل المحلي وإعادة السحب'}
            </button>
          </Card>
        </div>
      )}

      {/* ══ مقارنة ══ */}
      {activeTab==='diff' && (
        <Card title="🔍 مقارنة سجل بـ ID" icon="">
          <div className="flex gap-2 mb-3">
            <input value={diffId} onChange={e=>setDiffId(e.target.value)}
              placeholder="UUID السجل..."
              dir="ltr"
              className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-accent"/>
            <button onClick={compareSingle}
              className="px-4 py-2.5 rounded-xl bg-accent text-bg font-bold text-sm">
              بحث
            </button>
          </div>
          {diffResult && (
            diffResult.error
              ? <div className="text-red text-sm text-center py-3">{diffResult.error}</div>
              : <div>
                  <div className="text-accent text-xs font-bold mb-2">{diffResult.label}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[['📱 محلي','green',diffResult.local],['☁️ PostgreSQL','#3b82f6',diffResult.remote]].map(([lbl,clr,data])=>(
                      <div key={lbl}>
                        <div className="text-[10px] mb-1" style={{color:clr}}>{lbl}</div>
                        <pre className="text-[8px] bg-surface2 rounded-xl p-2 overflow-auto max-h-40" dir="ltr"
                          style={{color:clr}}>{JSON.stringify(data,null,2)}</pre>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const diffs = Object.keys(diffResult.local||{}).filter(k =>
                      JSON.stringify(diffResult.local[k]) !== JSON.stringify(diffResult.remote?.[k]))
                    return diffs.length ? (
                      <div className="mt-2 bg-accent/10 rounded-xl p-2">
                        <div className="text-accent text-xs font-bold mb-1">الاختلافات ({diffs.length}):</div>
                        {diffs.map(k=>(
                          <div key={k} className="text-[10px] mb-1">
                            <span className="text-muted font-mono">{k}: </span>
                            <span className="text-green">{JSON.stringify(diffResult.local[k])}</span>
                            <span className="text-muted"> → </span>
                            <span className="text-blue">{JSON.stringify(diffResult.remote?.[k])}</span>
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-green text-xs text-center mt-2">✅ متطابقان</div>
                  })()}
                </div>
          )}
        </Card>
      )}

      {/* ══ السجل ══ */}
      {activeTab==='log' && (
        <Card title="📋 سجل العمليات" icon="">
          <div className="flex justify-between mb-2">
            <span className="text-muted text-xs">{syncLog.length} عملية</span>
            <button onClick={()=>setSyncLog([])} className="text-xs text-muted border border-border px-2 py-1 rounded-lg">مسح</button>
          </div>
          {syncLog.length===0
            ? <div className="text-muted text-xs text-center py-4">لا يوجد سجل</div>
            : <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
                {syncLog.map((e,i)=>(
                  <div key={i} className="flex gap-2 text-[11px] py-1 border-b border-border/30">
                    <span className="text-muted flex-shrink-0 font-mono">{e.time}</span>
                    <span className={e.type==='error'?'text-red':e.type==='success'?'text-green':e.type==='warning'?'text-accent':'text-muted'}>
                      {e.msg}
                    </span>
                  </div>
                ))}
              </div>
          }
        </Card>
      )}
    </div>
  )
}
