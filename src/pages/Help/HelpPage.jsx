
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

const FAQ = [
  { q: 'كيف أضيف أسرة جديدة؟', a: 'اضغط على "قائمة الأسر" ثم زر ＋ إضافة في أعلى الصفحة.' },
  { q: 'كيف يعمل النظام بدون إنترنت؟', a: 'البيانات تُخزن محلياً على جهازك. عند الاتصال تتزامن تلقائياً.' },
  { q: 'كيف أنقل أسرة بين مخيمات؟', a: 'من صفحة "حركات الأسر" اضغط إضافة واختر نوع "نقل بين مخيمات".' },
  { q: 'ما هو الفرق بين الأدوار؟', a: 'مدير الإيواء: يرى كل شيء. مندوب المخيم: يدير مخيمه. المساعد: صلاحيات محدودة.' },
  { q: 'كيف أصدر البيانات؟', a: 'من صفحة "استيراد/تصدير" اضغط تصدير CSV.' },
  { q: 'كيف أغير كلمة المرور؟', a: 'من صفحة الإعدادات → تغيير كلمة المرور.' },
]

export default function HelpPage() {
  return (
    <div>
      <PageHeader icon="❓" title="المساعدة والدعم" />

      <Card title="الأسئلة الشائعة" icon="💬">
        <div className="flex flex-col gap-3">
          {FAQ.map((item, i) => (
            <details key={i} className="bg-surface2 border border-border rounded-xl p-3 group cursor-pointer">
              <summary className="font-bold text-white text-sm list-none flex items-center justify-between">
                {item.q}
                <span className="text-muted text-xs group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="text-muted text-xs mt-2 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </Card>

      <Card title="التواصل" icon="📞">
        <div className="flex flex-col gap-3 text-sm text-muted">
          <div className="flex items-center gap-2"><span>📧</span><span>support@camp-registry.com</span></div>
          <div className="flex items-center gap-2"><span>🌐</span><span>github.com/mramra/camp-registry</span></div>
          <div className="flex items-center gap-2"><span>📱</span><span>الإصدار v2.0 React</span></div>
        </div>
      </Card>
    </div>
  )
}
