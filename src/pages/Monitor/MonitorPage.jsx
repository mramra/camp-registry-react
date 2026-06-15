import { useState, useCallback } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import { quickSync } from '../../lib/syncAll'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

const LIMITS = {
  db_mb:      { max: 500,    label: '💾 قاعدة البيانات',  unit: 'MB'   },
  auth_users: { max: 50000,  label: '👥 مستخدمون/شهر',   unit: 'مستخدم' },
  egress_gb:  { max: 5,      label: '🌐 نقل البيانات',   unit: 'GB'   },
  storage_gb: { max: 1,      label: '📁 تخزين الملفات',  unit: 'GB'   },
}

function Bar({ pct, label, current, max, unit, warn=75, danger=90 }) {
  const color = pct>=danger ? 'bg-red' : pct>=warn ? 'bg-accent' : 'bg-green'
  const text  = pct>=danger ? 'text-red' : pct>=warn ? 'text-accent' : 'text-green'
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className={`font-black ${text}`}>{current} / {max} {unit} ({pct}%)</span>
      </div>
      <div className="w-full bg-surface2 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full transition-all ${color}`}
          style={{width:`${Math.min(100,pct)}%`}}/>
      </div>
      {pct>=danger && <p className="text-red text-[10px] mt-0.5">⚠️ قارب الحد الأقصى!</p>}
      {pct>=warn && pct<danger && <p className="text-accent text-[10px] mt-0.5">⚡ تجاوز 75%</p>}
    </div>
  )
}

export default function MonitorPage() {
  const { online, showToast } = useApp()
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [syncing,   setSyncing]   = useState(false)
  const [syncDone,  setSyncDone]  = useState(false)
  const [dexieRows, setDexieRows] = useState(null)

  const loadMonitor = useCallback(async () => {
    if (!online) return showToast('يحتاج اتصال بالإنترنت', true)
    setLoading(true)
    try {
      // حجم DB
      const { data: dbStats } = await supabase.rpc('get_db_stats').catch(() => ({ data: null }))

      // عدد السجلات
      const tables = ['families','family_members','camps','org_members',
                      'family_movements','dist_rounds','camp_distributions','camp_dist_families']
      const counts = {}
      await Promise.all(tables.map(async t => {
        try {
          let q = supabase.from(t).select('*',{count:'exact',head:true})
          if (['families','camps','org_members','family_movements','dist_rounds','camp_distributions'].includes(t))
            q = q.eq('org_id', ORG_ID)
          const { count } = await q
          counts[t] = count ?? 0
        } catch { counts[t] = 0 }
      }))

      const totalRows = Object.values(counts).reduce((s,v)=>s+v,0)
      const dbMB = dbStats?.db_size_mb ?? 0

      // Dexie local rows
      const dRows = {}
      for (const t of ['families','family_members','camps']) {
        dRows[t] = (await localDB[t]?.count?.()) ?? 0
      }
      setDexieRows(dRows)

      setData({
        dbMB, dbPct: Math.round(dbMB/500*100),
        authUsers: counts.org_members, authPct: Math.round(counts.org_members/50000*100),
        totalRows, counts,
        lastChecked: new Date().toLocaleTimeString('ar'),
      })
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }, [online])

  async function doSync() {
    if (!online) return showToast('يحتاج اتصال', true)
    setSyncing(true); setSyncDone(false)
    try {
      await quickSync()
      setSyncDone(true)
      showToast('✅ تمت المزامنة بنجاح')
      // تحديث عداد Dexie
      const dRows = {}
      for (const t of ['families','family_members','camps']) {
        dRows[t] = (await localDB[t]?.count?.()) ?? 0
      }
      setDexieRows(dRows)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setSyncing(false) }
  }

  return (
    <div>
      <PageHeader icon="🔭" title="مراقبة الموارد" subtitle="Supabase Free Tier"/>

      {/* حدود الخطة */}
      <Card title="🆓 حدود الخطة المجانية" icon="">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {[
            ['💾 قاعدة البيانات','500 MB'],
            ['👥 مستخدمين/شهر','50,000'],
            ['🌐 نقل بيانات','5 GB/شهر'],
            ['📁 تخزين ملفات','1 GB'],
            ['🏗️ مشاريع نشطة','2'],
            ['⏸️ إيقاف تلقائي','7 أيام بلا نشاط'],
          ].map(([l,v])=>(
            <div key={l} className="flex justify-between py-1 border-b border-border/20">
              <span className="text-muted">{l}</span>
              <span className="text-white font-bold">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 bg-green/10 border border-green/30 rounded-xl px-3 py-2">
          <p className="text-green text-[11px] font-bold">✅ Keep-Alive مفعّل</p>
          <p className="text-muted text-[10px]">GitHub Actions يُوقظ Supabase كل 48 ساعة</p>
        </div>
      </Card>

      {/* الاستخدام الحالي */}
      <Card title="📊 الاستخدام الحالي" icon="">
        {data ? (
          <>
            <Bar label="💾 قاعدة البيانات"
              pct={data.dbPct} current={data.dbMB} max={500} unit="MB"/>
            <Bar label="👥 مستخدمو النظام"
              pct={data.authPct} current={data.authUsers} max={50000} unit="مستخدم"/>

            <div className="flex flex-col gap-1 mt-3 pt-3 border-t border-border/30">
              <p className="text-muted text-[10px] mb-1">تفصيل السجلات ({data.totalRows} إجمالي):</p>
              {[
                ['👨‍👩‍👧 الأسر',          data.counts.families],
                ['👤 أفراد الأسر',    data.counts.family_members],
                ['🏕️ المخيمات',        data.counts.camps],
                ['🔄 الحركات',        data.counts.family_movements],
                ['📦 جولات التوزيع', data.counts.dist_rounds],
                ['✅ استلام التوزيع', data.counts.camp_dist_families],
              ].map(([l,v])=>(
                <div key={l} className="flex justify-between text-xs">
                  <span className="text-muted">{l}</span>
                  <span className="text-white font-bold">{v?.toLocaleString()??0}</span>
                </div>
              ))}
            </div>

            <p className="text-muted text-[10px] text-center mt-3">
              آخر فحص: {data.lastChecked}
            </p>
          </>
        ) : (
          <p className="text-muted text-xs text-center py-4">
            اضغط "فحص الآن" لعرض الاستخدام الحالي
          </p>
        )}
        <button onClick={loadMonitor} disabled={loading||!online}
          className="w-full mt-3 py-2.5 rounded-xl text-sm font-black text-bg bg-accent disabled:opacity-50">
          {loading ? '⏳ جاري الفحص...' : '🔭 فحص الآن'}
        </button>
      </Card>

      {/* المزامنة اليدوية */}
      <Card title="🔄 مزامنة البيانات المحلية" icon="">
        <p className="text-muted text-xs mb-3">
          تنزيل كل البيانات من Supabase → حفظها محلياً (Dexie) للعمل أوف لاين
        </p>
        {dexieRows && (
          <div className="flex gap-3 mb-3 text-xs">
            <span className="bg-surface2 px-2 py-1 rounded-lg text-muted">
              👨‍👩‍👧 {dexieRows.families} أسرة محلياً
            </span>
            <span className="bg-surface2 px-2 py-1 rounded-lg text-muted">
              👤 {dexieRows.family_members} فرد
            </span>
          </div>
        )}
        {syncDone && (
          <div className="bg-green/10 border border-green/30 rounded-xl px-3 py-2 mb-3">
            <p className="text-green text-xs font-bold">✅ تمت المزامنة — البيانات محدّثة محلياً</p>
          </div>
        )}
        <button onClick={doSync} disabled={syncing||!online}
          className="w-full py-2.5 rounded-xl text-sm font-black border border-accent/40 text-accent disabled:opacity-50"
          style={{background:'rgba(245,158,11,0.08)'}}>
          {syncing ? '⏳ جاري التنزيل...' : '📥 مزامنة الآن'}
        </button>
        <p className="text-muted text-[10px] text-center mt-2">
          المزامنة التلقائية تحدث عند تسجيل الدخول فقط
        </p>
      </Card>

      {/* نصائح */}
      <Card title="💡 نصائح لتجنب التوقف" icon="">
        <div className="flex flex-col gap-1.5 text-[11px] text-muted">
          <p>✅ Keep-Alive يعمل كل 48 ساعة تلقائياً</p>
          <p>✅ مزامنة تلقائية عند تسجيل الدخول فقط (لا streaming دائم)</p>
          <p>⚡ عند تجاوز 80% من DB: احذف السجلات القديمة</p>
          <p>⚡ عند تجاوز 90%: ترقية لـ Pro ($25/شهر) ضرورة</p>
          <p>🔴 إذا ظهرت "Exhausting resources": توقف PowerSync فعّال</p>
        </div>
      </Card>
    </div>
  )
}
