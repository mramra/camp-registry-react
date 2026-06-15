import { useState, useCallback } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import { quickSync } from '../../lib/syncAll'
import PageHeader from '../../components/ui/PageHeader'

// ── شريط تقدم مع لون ديناميكي ────────────────────────────
function Bar({ label, value, max, unit='', warn=70, danger=90, note='' }) {
  const pct   = max ? Math.round(Math.min(100, value/max*100)) : 0
  const color = pct>=danger ? '#EF4444' : pct>=warn ? '#F59E0B' : '#10B981'
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-black" style={{color}}>
          {value}{unit}{max ? ` / ${max}${unit} (${pct}%)` : ''}
        </span>
      </div>
      <div className="w-full bg-surface2 rounded-full h-2.5 overflow-hidden">
        <div className="h-2.5 rounded-full transition-all duration-500"
          style={{width:`${pct}%`, background:color}}/>
      </div>
      {note && <p className="text-[10px] mt-0.5" style={{color}}>{note}</p>}
    </div>
  )
}

// ── بطاقة مقياس دائري صغير ────────────────────────────────
function Gauge({ label, value, max, unit='' }) {
  const pct   = max ? Math.min(100, Math.round(value/max*100)) : value
  const color = pct>=90?'#EF4444':pct>=70?'#F59E0B':'#10B981'
  return (
    <div className="flex flex-col items-center bg-surface border border-border rounded-xl p-3">
      <div className="relative w-14 h-14 mb-1">
        <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3"/>
          <circle cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} ${100-pct}`}
            strokeDashoffset="0" strokeLinecap="round"/>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-black text-xs">{pct}%</span>
        </div>
      </div>
      <span className="text-muted text-[10px] text-center">{label}</span>
      <span className="font-bold text-xs" style={{color}}>{value}{unit}</span>
    </div>
  )
}

export default function MonitorPage() {
  const { online, showToast } = useApp()
  const [infra,     setInfra]     = useState(null)
  const [counts,    setCounts]    = useState(null)
  const [dexie,     setDexie]     = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [syncing,   setSyncing]   = useState(false)
  const [syncInfo,  setSyncInfo]  = useState(null)

  const loadAll = useCallback(async () => {
    if (!online) return showToast('يحتاج اتصال', true)
    setLoading(true)
    try {
      // ── جلب إحصائيات البنية التحتية
      const { data: infraData, error: ie } = await supabase.rpc('get_infra_stats')
      if (!ie && infraData) setInfra(infraData)

      // ── عدد السجلات من كل جدول
      const tables = ['families','family_members','camps','org_members',
                      'family_movements','dist_rounds','camp_distributions','camp_dist_families']
      const c = {}
      await Promise.all(tables.map(async t => {
        let q = supabase.from(t).select('*',{count:'exact',head:true})
        if (['families','camps','org_members','family_movements','dist_rounds','camp_distributions'].includes(t))
          q = q.eq('org_id', ORG_ID)
        const { count } = await q.catch(()=>({count:0}))
        c[t] = count ?? 0
      }))
      setCounts(c)

      // ── Dexie local
      const d = {}
      for (const t of ['families','family_members','camps','org_members']) {
        d[t] = (await localDB[t]?.count?.().catch(()=>0)) ?? 0
      }
      setDexie(d)

    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }, [online])

  async function doSync() {
    if (!online) return showToast('يحتاج اتصال', true)
    setSyncing(true)
    const start = Date.now()
    try {
      await quickSync()
      const elapsed = ((Date.now()-start)/1000).toFixed(1)
      setSyncInfo({ time: elapsed, at: new Date().toLocaleTimeString('ar') })
      showToast('✅ مزامنة مكتملة')
      // تحديث Dexie
      const d = {}
      for (const t of ['families','family_members','camps','org_members'])
        d[t] = (await localDB[t]?.count?.().catch(()=>0)) ?? 0
      setDexie(d)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setSyncing(false) }
  }

  const dbMB   = infra?.db_size_mb ?? 0
  const dbPct  = Math.round(dbMB/500*100)
  const connTotal = infra?.conn_total ?? 0
  const connMax   = infra?.conn_max ?? 60
  const connPct   = Math.round(connTotal/connMax*100)
  const cacheHit  = infra?.cache_hit_ratio ?? 0
  const totalRows = counts ? Object.values(counts).reduce((s,v)=>s+v,0) : 0

  return (
    <div>
      <PageHeader icon="🔭" title="مراقبة الموارد" subtitle="Supabase NANO"/>

      {/* ── زر الفحص ───────────────────────── */}
      <button onClick={loadAll} disabled={loading||!online}
        className="w-full mb-4 py-3 rounded-xl text-sm font-black text-bg bg-accent disabled:opacity-50 active:scale-95">
        {loading ? '⏳ جاري الفحص...' : '🔭 فحص الموارد الآن'}
      </button>

      {/* ── مقاييس دائرية (مثل Supabase Dashboard) ─── */}
      {infra && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Gauge label="قاعدة البيانات" value={dbMB} max={500} unit=" MB"/>
          <Gauge label="الاتصالات"       value={connTotal} max={connMax}/>
          <Gauge label="Cache Hit"        value={cacheHit} unit="%"/>
        </div>
      )}

      {/* ── شرائط تفصيلية ───────────────────── */}
      {infra && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <p className="text-accent text-xs font-black mb-3">📊 موارد Supabase NANO</p>

          <Bar label="💾 قاعدة البيانات"
            value={dbMB} max={500} unit=" MB"
            note={dbPct>=80?'⚠️ قارب الحد! فكر في تنظيف البيانات القديمة':''}/>

          <Bar label="🔌 الاتصالات النشطة"
            value={connTotal} max={connMax}
            note={connPct>=80?'⚠️ قارب الحد الأقصى للاتصالات!':''}/>

          <Bar label="⚡ Cache Hit Ratio" value={cacheHit} max={100} unit="%"
            warn={0} danger={0}
            note={cacheHit<90?'نسبة جيدة إذا فوق 90%':'✅ أداء ممتاز'}/>

          <div className="flex justify-between text-xs mt-3 pt-3 border-t border-border/30">
            <span className="text-muted">🔵 اتصالات نشطة</span>
            <span className="text-green font-bold">{infra.conn_active}</span>
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className="text-muted">⚪ اتصالات خاملة</span>
            <span className="text-muted font-bold">{infra.conn_idle}</span>
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className="text-muted">📊 إجمالي الصفوف</span>
            <span className="text-white font-bold">{totalRows.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── تفصيل الجداول ───────────────────── */}
      {infra?.tables && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <p className="text-accent text-xs font-black mb-3">🗂️ حجم الجداول</p>
          {infra.tables.slice(0,8).map(t=>(
            <div key={t.name} className="flex justify-between items-center py-1.5 border-b border-border/20 last:border-0">
              <span className="text-muted text-xs">{t.name}</span>
              <div className="text-right">
                <span className="text-white text-xs font-bold">{t.size_mb} MB</span>
                <span className="text-muted text-[10px] mr-2">{Number(t.rows||0).toLocaleString()} صف</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── عداد Supabase vs محلي ──────────── */}
      {counts && dexie && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <p className="text-accent text-xs font-black mb-3">⚖️ Supabase vs محلي (Dexie)</p>
          {['families','family_members','camps','org_members'].map(t=>{
            const sup = counts[t] ?? 0
            const loc = dexie[t] ?? 0
            const diff = sup - loc
            return (
              <div key={t} className="flex justify-between items-center py-1.5 border-b border-border/20 last:border-0">
                <span className="text-muted text-xs">
                  {t==='families'?'👨‍👩‍👧 أسر':t==='family_members'?'👤 أفراد':t==='camps'?'🏕️ مخيمات':'👥 مستخدمون'}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-blue">{sup} ☁️</span>
                  <span className="text-muted">{loc} 💾</span>
                  {diff!==0&&<span className={diff>0?'text-accent':'text-green'}>{diff>0?`+${diff}`:`${diff}`}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── مزامنة ──────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-3">
        <p className="text-accent text-xs font-black mb-1">🔄 مزامنة يدوية</p>
        <p className="text-muted text-[11px] mb-3">
          Supabase → Dexie — تلقائياً عند تسجيل الدخول فقط
        </p>
        {syncInfo && (
          <div className="bg-green/10 border border-green/30 rounded-xl px-3 py-2 mb-3">
            <p className="text-green text-[11px] font-bold">✅ مزامنة مكتملة في {syncInfo.time}s</p>
            <p className="text-muted text-[10px]">آخر تحديث: {syncInfo.at}</p>
          </div>
        )}
        <button onClick={doSync} disabled={syncing||!online}
          className="w-full py-2.5 rounded-xl text-sm font-black border border-accent/40 text-accent disabled:opacity-50"
          style={{background:'rgba(245,158,11,0.08)'}}>
          {syncing ? '⏳ جاري التنزيل...' : '📥 مزامنة الآن'}
        </button>
      </div>

      {/* ── حدود الخطة المجانية ─────────────── */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-3">
        <p className="text-accent text-xs font-black mb-3">🆓 حدود Supabase المجانية</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          {[['💾 DB','500 MB'],['🌐 Egress','5 GB/شهر'],['👥 MAU','50,000'],
            ['📁 Storage','1 GB'],['🔌 Connections','60'],['⏸️ Pause','7 أيام بلا نشاط']
          ].map(([l,v])=>(
            <div key={l} className="flex justify-between py-1 border-b border-border/20">
              <span className="text-muted">{l}</span><span className="text-white font-bold">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 bg-green/10 border border-green/30 rounded-xl px-3 py-1.5">
          <p className="text-green text-[11px] font-bold">✅ Keep-Alive: كل 48 ساعة تلقائياً</p>
        </div>
      </div>

      {!infra && !loading && (
        <p className="text-muted text-xs text-center py-4">
          اضغط "فحص الموارد" لعرض البيانات
        </p>
      )}
    </div>
  )
}
