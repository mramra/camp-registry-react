import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { localDB } from '../../lib/db'
import { getPowerSync } from '../../lib/powersync'
import { supabase, ORG_ID } from '../../lib/supabase'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'

const COLS = [
  { key:'families',           table:'families',           label:'الأسر',            icon:'👨‍👩‍👧' },
  { key:'family_members',     table:'family_members',     label:'الأفراد',           icon:'👤' },
  { key:'camps',              table:'camps',              label:'المخيمات',          icon:'🏕️' },
  { key:'org_members',        table:'org_members',        label:'المستخدمون',        icon:'👥' },
  { key:'family_movements',   table:'family_movements',   label:'الحركات',           icon:'🔄' },
  { key:'dist_rounds',        table:'dist_rounds',        label:'جولات التوزيع',     icon:'📦' },
  { key:'camp_dist_families', table:'camp_dist_families', label:'استلام التوزيعات',  icon:'✅' },
]

const TABS = [
  { key:'status', label:'📊 الحالة'  },
  { key:'tools',  label:'🔧 الأدوات' },
  { key:'diff',   label:'🔍 مقارنة'  },
  { key:'log',    label:'📋 السجل'   },
]

export default function SyncManager() {
  const { isOwner }           = useAuth()
  const { showToast, online } = useApp()

  const [stats,      setStats]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [syncing,    setSyncing]    = useState(false)
  const [pushing,    setPushing]    = useState(false)
  const [clearing,   setClearing]   = useState(false)
  const [syncLog,    setSyncLog]    = useState([])
  const [activeTab,  setActiveTab]  = useState('status')
  const [expanded,   setExpanded]   = useState(null)
  const [diffId,     setDiffId]     = useState('')
  const [diffResult, setDiffResult] = useState(null)

  if (!isOwner) return <Navigate to="/" replace />

  const log = useCallback((msg, type='info') => {
    const time = new Date().toLocaleTimeString('ar')
    setSyncLog(prev => [{ time, msg, type }, ...prev].slice(0, 100))
  }, [])

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const result = []
      for (const col of COLS) {
        try {
          const localDocs = await localDB[col.key]?.toArray().catch(()=>[]) || []
          const localCount = localDocs.length
          const sorted = [...localDocs].sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))
          const lastLocal = sorted[0]?.updated_at?.slice(0,16) || '—'
          let remoteCount=0, lastRemote='—'
          if (online) {
            const { count, data } = await supabase.from(col.table)
              .select('updated_at',{count:'exact'})
              .order('updated_at',{ascending:false}).limit(1)
            remoteCount = count||0
            lastRemote  = data?.[0]?.updated_at?.slice(0,16)||'—'
          }
          const diff = Math.abs(localCount-remoteCount)
          result.push({...col, localCount, lastLocal, remoteCount, lastRemote,
            inSync: online ? diff===0 : null, diff})
        } catch(e) {
          result.push({...col, localCount:0, remoteCount:0, diff:0, error:e.message})
        }
      }
      setStats({ collections:result, lastSync: localStorage.getItem('rxdb_last_sync') })
    } catch(e) { console.warn(e) }
    setLoading(false)
  }, [online])

  useEffect(() => { loadStats() }, [])

  const pullAll = async () => {
    if (!online) return showToast('لا يوجد اتصال', true)
    setSyncing(true)
    log('⬇️ PowerSync يُزامن تلقائياً...', 'info')
    try {
      const db = getPowerSync()
      await db.waitForFirstSync()
      log('✅ اكتملت المزامنة', 'success')
      showToast('✅ تمت المزامنة')
      await loadStats()
    } catch(e) { log(`❌ ${e.message}`, 'error') }
    setSyncing(false)
  }

  const pushAll = async () => {
    if (!online) return showToast('لا يوجد اتصال',true)
    setPushing(true)
    log('⬆️ دفع لـ Supabase...','info')
    let total=0, errors=0
    for (const col of COLS) {
      try {
        const docs = await localDB[col.key]?.toArray().catch(()=>[]) || []
        if (!docs.length) continue
        const { error } = await supabase.from(col.table).upsert(docs)
        if (error) { errors++; log(`❌ ${col.label}: ${error.message}`,'error') }
        else { total+=docs.length; log(`✅ ${col.label}: ${docs.length}`,'success') }
      } catch(e) { errors++; log(`❌ ${col.label}: ${e.message}`,'error') }
    }
    log(`${errors>0?'⚠️':'✅'} ${total} سجل، ${errors} خطأ`, errors>0?'warning':'success')
    showToast(errors>0?`⚠️ ${total} نجح، ${errors} فشل`:`✅ ${total} سجل`)
    setPushing(false)
    await loadStats()
  }

  const resetCol = async (key) => {
    if (!window.confirm(`مسح ${key==='all'?'كل البيانات':key} المحلية؟`)) return
    setClearing(true)
    const targets = key==='all' ? COLS.map(c=>c.key) : [key]
    for (const k of targets) {
      const docs = await localDB[k]?.toArray().catch(()=>[]) || []
      await Promise.all(docs.map(d => localDB[k]?.delete(d.id).catch(()=>{})))
      log(`🗑️ ${k}: ${docs.length} محذوف`,'warning')
    }
    if (online) await pullAll()
    setClearing(false)
  }

  const diagnose = async () => {
    log('🔍 تشخيص...','info')
    try {
      const {error} = await supabase.from('camps').select('id').limit(1)
      log(error?`❌ Supabase: ${error.message}`:'✅ Supabase متصل', error?'error':'success')
    } catch(e) { log(`❌ ${e.message}`,'error') }
    try {
      const c = await localDB.families.count()
      log(`✅ Dexie: ${c} أسرة`,'success')
    } catch(e) { log(`❌ Dexie: ${e.message}`,'error') }
    log(`📶 ${online?'متصل':'أوف لاين'}`, online?'success':'warning')
    log(`⏰ آخر sync: ${localStorage.getItem('rxdb_last_sync')||'لم يتم'}`,'info')
  }

  const compareSingle = async () => {
    if (!diffId.trim()) return
    setDiffResult(null)
    for (const col of COLS) {
      try {
        const local = await localDB[col.key]?.get(diffId.trim())
        if (local) {
          const {data:remote} = await supabase.from(col.table).select('*').eq('id',diffId.trim()).single()
          setDiffResult({label:col.label, local, remote})
          return
        }
      } catch {}
    }
    setDiffResult({error:'لم يُوجد السجل في Dexie'})
  }

  const bgCol = col =>
    !online ? 'rgba(55,65,81,0.2)' :
    col.error ? 'rgba(239,68,68,0.1)' :
    col.inSync ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'

  const logColor = t => t==='error'?'#ef4444':t==='success'?'#10b981':t==='warning'?'#f59e0b':'#9ca3af'

  return (
    <div>
      <PageHeader icon="🛠️" title="إدارة البيانات والمزامنة" />

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className={`text-xs px-3 py-1.5 rounded-xl font-bold ${online?'bg-green/10 text-green':'bg-red/10 text-red'}`}>
          {online?'🟢 متصل':'🔴 أوف لاين'}
        </span>
        {stats?.lastSync && (
          <span className="text-xs px-3 py-1.5 rounded-xl bg-surface2 text-muted">
            ⏰ {new Date(stats.lastSync).toLocaleTimeString('ar')}
          </span>
        )}
        <button onClick={loadStats} disabled={loading}
          className="text-xs px-3 py-1.5 rounded-xl bg-surface2 text-white font-bold">
          {loading?'⏳':'🔄'}
        </button>
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border
              ${activeTab===t.key?'bg-accent text-bg border-accent':'bg-surface2 border-border text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab==='status' && (
        <div className="flex flex-col gap-2">
          {loading ? <div className="flex justify-center py-8"><Spinner/></div>
          : stats?.collections.map(col=>(
            <div key={col.key} onClick={()=>setExpanded(expanded===col.key?null:col.key)}
              className="rounded-xl p-3 border border-border cursor-pointer"
              style={{background:bgCol(col)}}>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{col.icon}</span>
                  <span className="text-white text-sm font-bold">{col.label}</span>
                </div>
                {online && !col.error && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${col.inSync?'bg-green/20 text-green':'bg-accent/20 text-accent'}`}>
                    {col.inSync?'✅ متزامن':`⚠️ فرق ${col.diff}`}
                  </span>
                )}
                {col.error && <span className="text-[10px] text-red">❌</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[['📱 محلي',col.localCount,col.lastLocal],['☁️ Supabase',online?col.remoteCount:'—',online?col.lastRemote:'أوف لاين']].map(([lbl,cnt,date])=>(
                  <div key={lbl} className="bg-black/20 rounded-lg p-2">
                    <div className="text-[9px] text-muted">{lbl}</div>
                    <div className="text-white text-base font-black">{cnt}</div>
                    <div className="text-[9px] text-muted truncate">{date}</div>
                  </div>
                ))}
              </div>
              {expanded===col.key && (
                <div className="flex gap-2 mt-2">
                  <button onClick={e=>{e.stopPropagation();resetCol(col.key)}} disabled={clearing}
                    className="flex-1 py-1.5 text-[11px] font-bold rounded-lg border border-red/40 text-red"
                    style={{background:'rgba(239,68,68,0.08)'}}>
                    🗑️ مسح وإعادة سحب
                  </button>
                  <button onClick={async e=>{
                    e.stopPropagation()
                    const docs = await localDB[col.key]?.toArray().catch(()=>[]) || []
                    const {error} = await supabase.from(col.table).upsert(docs)
                    if (error) showToast(error.message,true)
                    else { log(`⬆️ ${col.label}: ${docs.length}`,'success'); showToast(`✅ ${docs.length}`) }
                  }}
                    className="flex-1 py-1.5 text-[11px] font-bold rounded-lg border border-blue/40 text-blue"
                    style={{background:'rgba(59,130,246,0.08)'}}>
                    ⬆️ دفع لـ Supabase
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab==='tools' && (
        <div className="flex flex-col gap-3">
          <Card title="⬇️ سحب كامل من Supabase" icon="">
            <p className="text-muted text-xs mb-3">يجلب كل البيانات ويحدّث Dexie المحلي</p>
            <button onClick={pullAll} disabled={syncing||!online}
              className="w-full py-3 rounded-xl font-black text-sm"
              style={{background:online?'#f59e0b':'#374151',color:online?'#0d1117':'#9ca3af'}}>
              {syncing?'⏳ جارٍ السحب...':'⬇️ سحب كامل'}
            </button>
          </Card>
          <Card title="⬆️ دفع المحلي لـ Supabase" icon="">
            <p className="text-muted text-xs mb-3">يرفع Dexie كاملاً لـ Supabase</p>
            <button onClick={pushAll} disabled={pushing||!online}
              className="w-full py-3 rounded-xl font-bold text-sm border border-blue/40 text-blue"
              style={{background:'rgba(59,130,246,0.08)'}}>
              {pushing?'⏳ جارٍ الدفع...':'⬆️ دفع الكل'}
            </button>
          </Card>
          <Card title="🔍 تشخيص" icon="">
            <button onClick={diagnose}
              className="w-full py-3 rounded-xl font-bold text-sm border border-green/40 text-green"
              style={{background:'rgba(16,185,129,0.08)'}}>
              🔍 تشخيص الآن
            </button>
          </Card>
          <Card title="⚠️ إعادة ضبط المحلي" icon="">
            <p className="text-red text-xs mb-3">⚠️ ستُفقد البيانات غير المزامَنة</p>
            <button onClick={()=>resetCol('all')} disabled={clearing}
              className="w-full py-3 rounded-xl font-bold text-sm border border-red/40 text-red"
              style={{background:'rgba(239,68,68,0.08)'}}>
              {clearing?'⏳...':'🗑️ مسح كل المحلي'}
            </button>
          </Card>
        </div>
      )}

      {activeTab==='diff' && (
        <Card title="🔍 مقارنة سجل بـ ID" icon="">
          <div className="flex gap-2 mb-3">
            <input value={diffId} onChange={e=>setDiffId(e.target.value)}
              placeholder="UUID السجل..." dir="ltr"
              className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-accent"/>
            <button onClick={compareSingle}
              className="px-4 py-2.5 rounded-xl bg-accent text-bg font-bold text-sm">بحث</button>
          </div>
          {diffResult && (
            diffResult.error
              ? <div className="text-red text-sm text-center py-3">{diffResult.error}</div>
              : <div>
                  <div className="text-accent text-xs font-bold mb-2">{diffResult.label}</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {[['📱 Dexie','#10b981',diffResult.local],['☁️ Supabase','#3b82f6',diffResult.remote]].map(([lbl,clr,data])=>(
                      <div key={lbl}>
                        <div className="text-[10px] font-bold mb-1" style={{color:clr}}>{lbl}</div>
                        <pre className="text-[8px] bg-surface2 rounded-xl p-2 overflow-auto max-h-40" dir="ltr" style={{color:clr}}>
                          {JSON.stringify(data,null,2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const diffs = Object.keys(diffResult.local||{}).filter(k=>
                      JSON.stringify(diffResult.local[k])!==JSON.stringify(diffResult.remote?.[k]))
                    return diffs.length
                      ? <div className="bg-accent/10 rounded-xl p-3">
                          <div className="text-accent text-xs font-bold mb-2">الاختلافات ({diffs.length}):</div>
                          {diffs.map(k=>(
                            <div key={k} className="text-[10px] mb-1">
                              <span className="text-muted font-mono">{k}: </span>
                              <span className="text-green">{String(diffResult.local[k])}</span>
                              <span className="text-muted"> → </span>
                              <span className="text-blue">{String(diffResult.remote?.[k])}</span>
                            </div>
                          ))}
                        </div>
                      : <div className="text-green text-xs text-center py-2">✅ متطابقان</div>
                  })()}
                </div>
          )}
        </Card>
      )}

      {activeTab==='log' && (
        <Card title="📋 سجل العمليات" icon="">
          <div className="flex justify-between items-center mb-2">
            <span className="text-muted text-xs">{syncLog.length} عملية</span>
            <button onClick={()=>setSyncLog([])} className="text-xs text-muted border border-border px-2 py-1 rounded-lg">مسح</button>
          </div>
          {syncLog.length===0
            ? <div className="text-muted text-xs text-center py-6">نفّذ عملية لتظهر هنا</div>
            : <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
                {syncLog.map((e,i)=>(
                  <div key={i} className="flex gap-2 text-[11px] py-1.5 border-b border-border/30">
                    <span className="text-muted flex-shrink-0 font-mono text-[10px]">{e.time}</span>
                    <span style={{color:logColor(e.type)}}>{e.msg}</span>
                  </div>
                ))}
              </div>
          }
        </Card>
      )}
    </div>
  )
}
