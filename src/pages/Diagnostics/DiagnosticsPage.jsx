import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

const TABLE_AR = {
  families: 'الأسر', family_members: 'الأفراد', camps: 'المخيمات',
  org_members: 'المستخدمون', family_movements: 'الحركات',
  dist_rounds: 'جولات التوزيع', camp_distributions: 'الدفعات',
  camp_dist_families: 'الاستلام',
}

export default function DiagnosticsPage() {
  const [tests, setTests] = useState({})
  const [running, setRunning] = useState(false)
  const [counts, setCounts] = useState({})

  useEffect(() => { runAll() }, [])

  async function runAll() {
    setRunning(true)
    const results = {}

    results.internet = { ok: navigator.onLine, detail: navigator.onLine ? 'متصل' : 'غير متصل' }

    const { data: { session } } = await supabase.auth.getSession()
    results.session = { ok: !!session, detail: session?.user?.email || 'بلا جلسة' }

    const t0 = Date.now()
    const { error: pingErr } = await supabase.from('families').select('id').limit(1)
    results.rest = { ok: !pingErr, detail: pingErr ? pingErr.message : `يعمل (${Date.now() - t0}ms)` }

    setTests(results)

    const c = {}
    for (const t of Object.keys(TABLE_AR)) {
      const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true })
      c[t] = error ? '—' : count
    }
    setCounts(c)
    setRunning(false)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon="🩺" title="تشخيص النظام"
        subtitle="حالة الاتصال بـ Supabase"
        action={
          <button onClick={runAll} disabled={running}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm disabled:opacity-50">
            {running ? '⏳' : '🔄'} إعادة الفحص
          </button>
        }
      />

      <Card>
        <div className="space-y-2">
          {[
            ['internet', 'الاتصال بالإنترنت'],
            ['session', 'جلسة Supabase'],
            ['rest', 'Supabase REST'],
          ].map(([key, label]) => {
            const t = tests[key]
            if (!t) return null
            return (
              <div key={key} className="flex items-center justify-between bg-surface2 rounded-xl px-4 py-3">
                <span className="text-white text-sm font-bold">{label}</span>
                <span className={`text-sm font-bold ${t.ok ? 'text-green' : 'text-red'}`}>
                  {t.ok ? '✅' : '❌'} {t.detail}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <p className="text-accent font-black text-sm mb-3">📊 عدد السجلات في كل جدول</p>
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(TABLE_AR).map(([key, label]) => (
              <tr key={key} className="border-b border-border">
                <td className="py-2 text-white">{label}</td>
                <td className="py-2 text-left text-accent font-bold">{counts[key] ?? '...'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <p className="text-muted text-xs leading-relaxed">
          ℹ️ هذا التطبيق يعمل مباشرة مع Supabase بدون تخزين محلي —
          كل قراءة وكتابة تذهب فوراً للسيرفر. لا حاجة لمزامنة أو &quot;رفع بيانات محلية&quot;،
          لأنه لا يوجد نسخة محلية أصلاً.
        </p>
      </Card>
    </div>
  )
}
