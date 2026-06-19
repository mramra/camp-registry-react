/**
 * DiagnosticsPage.jsx — شاشة تشخيص للموبايل
 * تعرض كل مشاكل النظام: PowerSync، الاتصال، المخازن، السجل
 */
import { useState, useEffect, useRef } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { getPowerSync, isPowerSyncConnected, connectPowerSync } from '../../lib/powersync'
import { pushLocalChanges } from '../../lib/pushLocalChanges'
import { quickSync } from '../../lib/syncAll'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/ui/PageHeader'

// ── التقاط console.log في الذاكرة ────────────────────────
const LOG_BUFFER = []
const MAX_LOGS = 100
if (typeof window !== 'undefined' && !window.__diagHooked) {
  window.__diagHooked = true
  ;['log','warn','error'].forEach(level => {
    const orig = console[level]
    console[level] = (...args) => {
      const msg = args.map(a => typeof a==='object' ? JSON.stringify(a) : String(a)).join(' ')
      // فقط رسائل النظام المهمة
      if (msg.includes('[PowerSync]') || msg.includes('[sync]') || msg.includes('[δSync]') ||
          msg.includes('[connector]') || msg.includes('[queue]') || msg.includes('[login]') ||
          msg.includes('Error') || msg.includes('error') || msg.includes('فشل')) {
        LOG_BUFFER.unshift({ level, msg, time: new Date().toLocaleTimeString('ar-EG') })
        if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.pop()
      }
      orig.apply(console, args)
    }
  })
}

const TABLES = ['families','family_members','camps','org_members','family_movements','dist_rounds','camp_distributions','camp_dist_families']

export default function DiagnosticsPage() {
  const { isOwner, isSuperAdmin } = useAuth()
  const [tests,   setTests]   = useState({})
  const [running, setRunning] = useState(false)
  const [logs,    setLogs]    = useState([])
  const [counts,  setCounts]  = useState({ supabase:{}, sqlite:{} })
  const logTimer = useRef(null)
  const [pushing, setPushing]   = useState(false)
  const [pushMsg, setPushMsg]   = useState('')
  const [pushReport, setPushReport] = useState(null)

  // تحديث السجل كل ثانية
  useEffect(() => {
    logTimer.current = setInterval(() => setLogs([...LOG_BUFFER]), 1000)
    return () => clearInterval(logTimer.current)
  }, [])

  useEffect(() => { runAll() }, [])

  async function runAll() {
    setRunning(true)
    const t = {}

    // 1. الإنترنت
    t.online = { ok: navigator.onLine, label: 'الاتصال بالإنترنت',
                 val: navigator.onLine ? 'متصل' : 'غير متصل' }

    // 2. جلسة Supabase
    try {
      const { data:{ session } } = await supabase.auth.getSession()
      t.session = { ok: !!session, label: 'جلسة Supabase',
                    val: session ? `صالحة (${session.user.email})` : 'لا توجد جلسة' }
    } catch(e) {
      t.session = { ok:false, label:'جلسة Supabase', val:'خطأ: '+e.message }
    }

    // 3. اتصال Supabase REST
    try {
      const start = Date.now()
      const { error } = await supabase.from('camps').select('id',{count:'exact',head:true}).eq('org_id',ORG_ID)
      t.supabaseRest = { ok: !error, label:'Supabase REST',
                         val: error ? error.message : `يعمل (${Date.now()-start}ms)` }
    } catch(e) {
      t.supabaseRest = { ok:false, label:'Supabase REST', val:e.message }
    }

    // 4. PowerSync SQLite متاح
    try {
      const db = getPowerSync()
      t.sqliteReady = { ok: !!db, label:'SQLite متاح', val: db ? 'نعم' : 'لا' }
    } catch(e) {
      t.sqliteReady = { ok:false, label:'SQLite متاح', val:e.message }
    }

    // 5. PowerSync متصل (streaming)
    t.psConnected = { ok: isPowerSyncConnected(), label:'PowerSync مزامنة فورية',
                      val: isPowerSyncConnected() ? '✅ متصل' : '⚠️ غير متصل (local-only)' }

    // 6. قائمة الانتظار
    try {
      const db = getPowerSync()
      const rows = await db.getAll(`SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'`)
      const pending = rows?.[0]?.c || 0
      t.queue = { ok: pending===0, label:'عمليات معلقة', val: `${pending} عملية`, warn: pending>0 }
    } catch {
      t.queue = { ok:true, label:'عمليات معلقة', val:'0' }
    }

    setTests(t)

    // ── أعداد السجلات في كل مخزن ──────────────────────────
    const c = { supabase:{}, sqlite:{} }
    await Promise.all(TABLES.map(async tbl => {
      // Supabase
      try {
        const orgId = !['family_members','camp_dist_families'].includes(tbl)
        let q = supabase.from(tbl).select('id',{count:'exact',head:true})
        if (orgId) q = q.eq('org_id', ORG_ID)
        const { count } = await q
        c.supabase[tbl] = count ?? 0
      } catch { c.supabase[tbl] = '—' }
      // SQLite
      try {
        const db = getPowerSync()
        const rows = await db.getAll(`SELECT COUNT(*) as n FROM ${tbl}`)
        c.sqlite[tbl] = Number(rows[0]?.n) || 0
      } catch { c.sqlite[tbl] = '—' }
    }))
    setCounts(c)
    setRunning(false)
  }

  async function tryConnect() {
    setRunning(true)
    await connectPowerSync()
    await new Promise(r=>setTimeout(r,1500))
    await runAll()
  }

  // إعادة بناء المخازن المحلية من السيرفر — آمن (السيرفر هو المصدر)
  async function rebuildLocal() {
    setPushing(true)
    setPushMsg('🔄 إعادة جلب كل البيانات من السيرفر...')
    try {
      await quickSync()
      setPushMsg('✅ اكتملت إعادة البناء')
      await new Promise(r=>setTimeout(r,800))
      await runAll()
    } catch(e) {
      setPushMsg('خطأ: ' + e.message)
    } finally {
      setPushing(false)
    }
  }

  // رفع البيانات المحلية غير المرفوعة — آمن
  async function doPush() {
    setPushing(true)
    setPushReport(null)
    setPushMsg('بدء الرفع...')
    try {
      const report = await pushLocalChanges(setPushMsg)
      setPushReport(report)
      await runAll()  // أعد الفحص لرؤية التطابق
    } catch(e) {
      setPushMsg('خطأ: ' + e.message)
    } finally {
      setPushing(false)
    }
  }

  // إعادة بناء المخازن المحلية من Supabase (المصدر الموثوق)
  async function rebuildStores() {
    if (!isOwner && !isSuperAdmin) {
      alert('⛔ إعادة بناء البيانات المحلية لمدير النظام فقط')
      return
    }
    if (!confirm('سيُعاد جلب كل البيانات من السيرفر وتنظيف التكرارات المحلية. متابعة؟')) return
    setRunning(true)
    try {
      console.log('[rebuild] بدء إعادة البناء...')

      // 1. امسح SQLite
      try {
        const db = getPowerSync()
        for (const tbl of TABLES) {
          await db.execute(`DELETE FROM ${tbl}`).catch(()=>{})
        }
        console.log('[rebuild] SQLite مُسح')
      } catch {}

      // 2. أعد الجلب من Supabase
      const { quickSync } = await import('../../lib/syncAll')
      await quickSync()
      console.log('[rebuild] ✅ اكتمل — البيانات نظيفة الآن')

      await new Promise(r=>setTimeout(r,1000))
      await runAll()
    } catch(e) {
      console.error('[rebuild] فشل:', e.message)
    } finally {
      setRunning(false)
    }
  }

  const TABLE_AR = {
    families:'الأسر', family_members:'الأفراد', camps:'المخيمات',
    org_members:'المستخدمون', family_movements:'الحركات', dist_rounds:'التوزيعات',
    camp_distributions:'دفعات', camp_dist_families:'استلام',
  }

  return (
    <div className="pb-8">
      <PageHeader icon="🩺" title="تشخيص النظام" subtitle="حالة الاتصال والمزامنة"/>

      {/* أزرار */}
      <div className="flex gap-2 mb-2">
        <button onClick={runAll} disabled={running}
          className="flex-1 py-2.5 rounded-xl text-sm font-black bg-accent text-bg disabled:opacity-50">
          {running ? '⏳ جاري الفحص...' : '🔄 إعادة الفحص'}
        </button>
        <button onClick={tryConnect} disabled={running}
          className="flex-1 py-2.5 rounded-xl text-sm font-black bg-surface2 text-accent border border-accent/30 disabled:opacity-50">
          🔌 ربط PowerSync
        </button>
      </div>

      {/* زر الرفع الآمن */}
      <button onClick={doPush} disabled={pushing}
        className="w-full mb-2 py-3 rounded-xl text-sm font-black bg-green text-white disabled:opacity-50">
        {pushing ? '⏳ جاري الرفع...' : '⬆️ رفع البيانات المحلية الجديدة (آمن — لا يحذف)'}
      </button>

      {/* زر إعادة بناء SQLite من السيرفر */}
      <button onClick={rebuildLocal} disabled={pushing}
        className="w-full mb-3 py-3 rounded-xl text-sm font-black bg-surface2 text-accent border border-accent/30 disabled:opacity-50">
        🔄 إعادة بناء المخازن من السيرفر (يصلح SQLite الناقص)
      </button>

      {/* رسالة التقدم */}
      {pushMsg && pushing && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-surface2 border border-accent/30 text-accent text-xs">
          {pushMsg}
        </div>
      )}

      {/* تقرير الرفع */}
      {pushReport && (
        <div className="mb-3 bg-surface border border-green/30 rounded-2xl p-3">
          <p className="text-green text-xs font-black mb-2">✅ تقرير الرفع</p>
          <div className="flex flex-col gap-1 text-xs">
            {[
              ['families', 'أسر'],
              ['family_members', 'أفراد'],
              ['dist_rounds', 'جولات توزيع'],
              ['camp_distributions', 'دفعات'],
              ['camp_dist_families', 'استلام'],
            ].map(([key, label]) => pushReport[key] && (
              <div key={key} className="flex justify-between">
                <span className="text-muted">{label} رُفعت:</span>
                <span className="text-green font-bold">{pushReport[key].uploaded} من {pushReport[key].total}</span>
              </div>
            ))}
            {pushReport.errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-red text-[11px] font-bold mb-1">أخطاء ({pushReport.errors.length}):</p>
                {pushReport.errors.slice(0,5).map((e,i)=>(
                  <p key={i} className="text-red text-[10px]">• {e}</p>
                ))}
              </div>
            )}
            {Object.entries(pushReport).every(([k,v]) => k==='errors' || v.uploaded === 0) && pushReport.errors.length === 0 && (
              <p className="text-muted text-[11px] mt-1">كل البيانات المحلية موجودة بالفعل في السيرفر ✅</p>
            )}
          </div>
        </div>
      )}
      <button onClick={rebuildStores} disabled={running}
        className="w-full mb-3 py-2.5 rounded-xl text-sm font-black bg-red/10 text-red border border-red/30 disabled:opacity-50">
        🔧 إعادة بناء المخازن المحلية (تنظيف التكرارات)
      </button>

      {/* الفحوصات */}
      <div className="bg-surface border border-border rounded-2xl p-3 mb-3">
        <p className="text-accent text-xs font-black mb-2">📋 الفحوصات</p>
        <div className="flex flex-col gap-1.5">
          {Object.entries(tests).map(([k,t])=>(
            <div key={k} className="flex items-center justify-between bg-surface2 rounded-xl px-3 py-2">
              <span className="text-white text-xs font-bold">{t.label}</span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] ${t.ok?'text-green':t.warn?'text-accent':'text-red'}`}>
                  {t.val}
                </span>
                <span className="text-sm">{t.ok ? '✅' : t.warn ? '⚠️' : '❌'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* جدول المخازن */}
      <div className="bg-surface border border-border rounded-2xl p-3 mb-3 overflow-x-auto">
        <p className="text-accent text-xs font-black mb-2">📊 مقارنة المخازن</p>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="text-right py-1.5">الجدول</th>
              <th className="text-center">☁️ سيرفر</th>
              <th className="text-center">🗄️ SQLite</th>
            </tr>
          </thead>
          <tbody>
            {TABLES.map(tbl=>{
              const s=counts.supabase[tbl], q=counts.sqlite[tbl]
              const match = s===q
              return (
                <tr key={tbl} className="border-b border-border/30">
                  <td className="text-right py-1.5 text-white">{TABLE_AR[tbl]}</td>
                  <td className="text-center text-muted">{s}</td>
                  <td className={`text-center ${q===s?'text-green':'text-red'}`}>{q}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-muted text-[10px] mt-2">
          🟢 = مطابق للسيرفر | 🔴 = ناقص
        </p>
      </div>

      {/* السجل المباشر */}
      <div className="bg-surface border border-border rounded-2xl p-3">
        <div className="flex justify-between items-center mb-2">
          <p className="text-accent text-xs font-black">📜 سجل النظام المباشر</p>
          <button onClick={()=>{LOG_BUFFER.length=0; setLogs([])}}
            className="text-[10px] text-muted">🗑️ مسح</button>
        </div>
        <div className="bg-bg rounded-xl p-2 max-h-64 overflow-y-auto font-mono">
          {logs.length===0
            ? <p className="text-muted text-[10px] text-center py-3">لا توجد رسائل بعد...</p>
            : logs.map((l,i)=>(
              <div key={i} className={`text-[10px] leading-relaxed py-0.5 border-b border-border/20 ${
                l.level==='error'?'text-red':l.level==='warn'?'text-accent':'text-green'
              }`}>
                <span className="text-muted">{l.time}</span> {l.msg}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}
