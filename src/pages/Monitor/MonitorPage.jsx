import { useState, useCallback } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import { quickSync } from '../../lib/syncAll'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'

function pct(v, max) { return max > 0 ? Math.min(100, Math.round(v / max * 100)) : 0 }
function barColor(p) { return p >= 90 ? '#EF4444' : p >= 70 ? '#F59E0B' : '#10B981' }

function StatBar({ label, value, max, unit = '' }) {
  const p = pct(value, max)
  const c = barColor(p)
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-black" style={{ color: c }}>
          {value}{unit} / {max}{unit} ({p}%)
        </span>
      </div>
      <div className="w-full bg-surface2 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full transition-all"
          style={{ width: `${p}%`, background: c }} />
      </div>
      {p >= 90 && <p className="text-red text-[10px] mt-0.5">⚠️ قارب الحد الأقصى!</p>}
      {p >= 70 && p < 90 && <p className="text-accent text-[10px] mt-0.5">⚡ تجاوز 70%</p>}
    </div>
  )
}

export default function MonitorPage() {
  const { online, showToast } = useApp()
  const [infra,    setInfra]    = useState(null)
  const [counts,   setCounts]   = useState(null)
  const [dexie,    setDexie]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [syncing,  setSyncing]  = useState(false)
  const [syncTime, setSyncTime] = useState(null)

  const load = useCallback(async () => {
    if (!online) { showToast('يحتاج اتصال', true); return }
    setLoading(true)
    try {
      // إحصائيات البنية التحتية
      const { data: infraData } = await supabase.rpc('get_infra_stats').catch(() => ({ data: null }))
      if (infraData) setInfra(infraData)

      // عدد السجلات
      const tbls = ['families','family_members','camps','org_members','family_movements','dist_rounds','camp_distributions','camp_dist_families']
      const c = {}
      await Promise.all(tbls.map(async t => {
        try {
          let q = supabase.from(t).select('*', { count: 'exact', head: true })
          if (!['family_members','camp_dist_families'].includes(t)) q = q.eq('org_id', ORG_ID)
          const { count } = await q
          c[t] = count ?? 0
        } catch { c[t] = 0 }
      }))
      setCounts(c)

      // Dexie
      const d = {}
      for (const t of ['families','family_members','camps']) {
        try { d[t] = await localDB[t]?.count?.() ?? 0 } catch { d[t] = 0 }
      }
      setDexie(d)
    } catch (e) { showToast('خطأ: ' + e.message, true) }
    finally { setLoading(false) }
  }, [online])

  const sync = useCallback(async () => {
    if (!online) { showToast('يحتاج اتصال', true); return }
    setSyncing(true)
    const t0 = Date.now()
    try {
      await quickSync()
      setSyncTime(((Date.now() - t0) / 1000).toFixed(1))
      showToast('✅ تمت المزامنة')
      const d = {}
      for (const t of ['families','family_members','camps'])
        try { d[t] = await localDB[t]?.count?.() ?? 0 } catch { d[t] = 0 }
      setDexie(d)
    } catch (e) { showToast('خطأ: ' + e.message, true) }
    finally { setSyncing(false) }
  }, [online])

  const dbMB  = Number(infra?.db_size_mb ?? 0)
  const cTotal = Number(infra?.conn_total ?? 0)
  const cMax   = Number(infra?.conn_max ?? 60)
  const cache  = Number(infra?.cache_hit_ratio ?? 0)
  const total  = counts ? Object.values(counts).reduce((s, v) => s + Number(v), 0) : 0

  const TABLES_AR = {
    families:'👨‍👩‍👧 الأسر', family_members:'👤 الأفراد', camps:'🏕️ المخيمات',
    org_members:'👥 المستخدمون', family_movements:'🔄 الحركات',
    dist_rounds:'📦 جولات التوزيع', camp_distributions:'📋 دفعات التوزيع',
    camp_dist_families:'✅ استلام التوزيع'
  }

  return (
    <div>
      <PageHeader icon="🔭" title="مراقبة الموارد" subtitle="Supabase NANO" />

      {/* ── فحص ─────────────────────────── */}
      <button onClick={load} disabled={loading || !online}
        className="w-full mb-4 py-3 rounded-xl text-sm font-black text-bg bg-accent disabled:opacity-50">
        {loading ? <span className="flex items-center justify-center gap-2"><Spinner size="sm" /> جاري الفحص...</span> : '🔭 فحص الموارد'}
      </button>

      {/* ── موارد البنية التحتية ────────── */}
      {infra && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <p className="text-accent text-xs font-black mb-3">📊 موارد Supabase NANO</p>

          <StatBar label="💾 قاعدة البيانات" value={dbMB}  max={500}  unit=" MB" />
          <StatBar label="🔌 الاتصالات"       value={cTotal} max={cMax}            />

          {/* Cache Hit — عكسي: كلما أعلى كلما أفضل */}
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted">⚡ Cache Hit Ratio</span>
              <span className="font-black" style={{ color: cache >= 90 ? '#10B981' : '#F59E0B' }}>
                {cache}% {cache >= 90 ? '✅' : '⚠️'}
              </span>
            </div>
            <div className="w-full bg-surface2 rounded-full h-2">
              <div className="h-2 rounded-full bg-green transition-all"
                style={{ width: `${cache}%` }} />
            </div>
          </div>

          <div className="pt-3 mt-2 border-t border-border/30 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">🟢 اتصالات نشطة</span>
              <span className="text-green font-bold">{infra.conn_active}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">⚪ اتصالات خاملة</span>
              <span className="text-muted font-bold">{infra.conn_idle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">📋 إجمالي الصفوف</span>
              <span className="text-white font-bold">{total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── حجم الجداول ─────────────────── */}
      {infra?.tables?.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <p className="text-accent text-xs font-black mb-2">🗂️ حجم الجداول</p>
          {(infra.tables || []).slice(0, 8).map((t, i) => (
            <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0 text-xs">
              <span className="text-muted">{t.name}</span>
              <span className="text-white font-bold">
                {t.size_mb} MB
                <span className="text-muted font-normal mr-2">({Number(t.rows || 0).toLocaleString()} صف)</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Supabase vs Dexie ───────────── */}
      {counts && dexie && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <p className="text-accent text-xs font-black mb-2">⚖️ Supabase ☁️ vs محلي 💾</p>
          {['families','family_members','camps'].map(t => {
            const sup = Number(counts[t] ?? 0)
            const loc = Number(dexie[t] ?? 0)
            const diff = sup - loc
            return (
              <div key={t} className="flex justify-between py-1.5 border-b border-border/20 last:border-0 text-xs">
                <span className="text-muted">{TABLES_AR[t]}</span>
                <div className="flex gap-3">
                  <span className="text-blue">{sup} ☁️</span>
                  <span className="text-white">{loc} 💾</span>
                  {diff !== 0 && (
                    <span className={diff > 0 ? 'text-accent' : 'text-green'}>
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── مزامنة ──────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-3">
        <p className="text-accent text-xs font-black mb-1">🔄 مزامنة يدوية</p>
        <p className="text-muted text-[11px] mb-3">تنزيل كل البيانات من Supabase → محلياً (Dexie)</p>
        {syncTime && (
          <div className="bg-green/10 border border-green/30 rounded-xl px-3 py-2 mb-3">
            <p className="text-green text-xs font-bold">✅ اكتملت في {syncTime} ثانية</p>
          </div>
        )}
        <button onClick={sync} disabled={syncing || !online}
          className="w-full py-2.5 rounded-xl text-sm font-black border border-accent/40 text-accent disabled:opacity-50"
          style={{ background: 'rgba(245,158,11,0.08)' }}>
          {syncing ? '⏳ جاري التنزيل...' : '📥 مزامنة الآن'}
        </button>
      </div>

      {/* ── حدود الخطة ──────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-3">
        <p className="text-accent text-xs font-black mb-2">🆓 حدود الخطة المجانية</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {[['💾 DB','500 MB'],['🌐 Egress','5 GB/شهر'],['👥 MAU','50,000'],
            ['🔌 Connections','60'],['📁 Storage','1 GB'],['⏸️ Pause','7 أيام']
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between py-1 border-b border-border/20">
              <span className="text-muted">{l}</span>
              <span className="text-white font-bold">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 bg-green/10 border border-green/30 rounded-xl px-3 py-1.5">
          <p className="text-green text-[11px] font-bold">✅ Keep-Alive كل 48 ساعة — لا إيقاف تلقائي</p>
        </div>
      </div>
    </div>
  )
}
