/**
 * SecurityAudit.jsx — الفحص الأمني
 * يشغّل فحصاً حقيقياً (عبر admin-users Edge Function، action=security_audit):
 * يحاكي جلسة دخول حقيقية لكل مستخدم (غير platform_owner) ويقرأ كل الجداول
 * الحساسة بهويته الفعلية، ثم يقارن ما يراه بما يجب أن يراه حسب دوره ومخيمه.
 * يكشف أي تسريب RLS فوراً — وليس فلترة واجهة فقط.
 * هذه الصفحة لمالك المنصة فقط.
 */
import { useState, useEffect } from 'react'
import { callAdminAPI, ORG_ID, supabase } from '../../lib/db'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'

const TABLE_AR = {
  camps: 'المخيمات', dist_rounds: 'جولات التوزيع', camp_distributions: 'دفعات التوزيع',
  families: 'الأسر', family_members: 'الأفراد', family_movements: 'حركات الأسر',
  family_history: 'سجل التغييرات/الموافقات', camp_dist_families: 'سجل الاستلام',
  org_members: 'المستخدمون',
}

const ROLE_AR = {
  super_admin: 'مدير إيواء', camp_delegate: 'مندوب مخيم', assistant: 'مساعد',
}

export default function SecurityAudit() {
  const [running, setRunning] = useState(false)
  const [report,  setReport]  = useState(null)
  const [error,   setError]   = useState('')
  const [campMap, setCampMap] = useState({})

  useEffect(() => {
    supabase.from('camps').select('id,name').eq('org_id', ORG_ID).then(({ data }) => {
      setCampMap(Object.fromEntries((data || []).map(c => [c.id, c.name])))
    })
  }, [])

  async function runAudit() {
    setRunning(true)
    setError('')
    setReport(null)
    try {
      const data = await callAdminAPI('security_audit', {})
      setReport(data)
    } catch (e) {
      setError(e.message || 'فشل تشغيل الفحص')
    } finally {
      setRunning(false)
    }
  }

  function campName(id) {
    return campMap[id] || id?.slice(0, 8) || '—'
  }

  return (
    <div>
      <PageHeader icon="🛡️" title="الفحص الأمني" subtitle="فحص حقيقي لعزل المخيمات على مستوى القاعدة (RLS)" />

      <Card>
        <p className="text-muted text-xs mb-3 leading-relaxed">
          يسجّل دخول مؤقتاً بهوية كل مستخدم (غير مالك المنصة) فعلياً، ويقرأ كل الجداول الحساسة
          بصلاحيته الحقيقية، ثم يقارن ما يراه بما يجب أن يراه حسب دوره ومخيمه. أي صف يظهر
          خارج النطاق المسموح = تسريب حقيقي يُكشف فوراً.
        </p>
        <button onClick={runAudit} disabled={running}
          className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
          {running ? '⏳ جارٍ الفحص... قد يستغرق دقيقة' : '🔍 تشغيل الفحص الآن'}
        </button>
        {error && <p className="text-red text-xs mt-2 font-bold">⚠️ {error}</p>}
      </Card>

      {running && (
        <div className="flex justify-center py-10"><Spinner /></div>
      )}

      {report && (
        <>
          <p className="text-muted text-[11px] mb-2 mt-1">
            آخر فحص: {new Date(report.checked_at).toLocaleString('ar-EG')} — {report.targets_checked} مستخدم
          </p>

          {report.report.length === 0 && (
            <Card><p className="text-muted text-sm text-center py-4">لا يوجد مستخدمون لفحصهم (غير مالك المنصة)</p></Card>
          )}

          <div className="flex flex-col gap-3">
            {report.report.map((r, i) => (
              <Card key={i}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-white text-sm font-bold">{r.member}</div>
                    <div className="text-muted text-[11px]">
                      {ROLE_AR[r.role] || r.role}
                      {r.camp_id ? ` — ${campName(r.camp_id)}` : ''}
                    </div>
                  </div>
                  {r.error ? (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-muted/10 text-muted border border-border">
                      ⚠️ تعذر الفحص
                    </span>
                  ) : r.has_leak ? (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-red/10 text-red border border-red/30">
                      🚨 تسريب
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-green/10 text-green border border-green/30">
                      ✅ آمن
                    </span>
                  )}
                </div>

                {r.error && <p className="text-red text-[11px]">{r.error}</p>}

                {!r.error && r.has_leak && (
                  <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-border">
                    {r.tables.filter(t => t.leaked).map(t => (
                      <div key={t.table} className="text-[11px] text-red">
                        <span className="font-bold">{TABLE_AR[t.table] || t.table}:</span>{' '}
                        يرى {t.rows} سجل يشمل مخيمات خارج صلاحيته
                        ({t.leaked_camps.map(c => campName(c)).join('، ')})
                      </div>
                    ))}
                  </div>
                )}

                {!r.error && !r.has_leak && (
                  <div className="text-[10px] text-muted mt-1">
                    {r.tables.length} جدول فُحص — كل البيانات ضمن النطاق المسموح فقط
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
