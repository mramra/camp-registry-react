
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { useAuth } from '../../context/AuthContext'

export default function Subscription() {
  const { isOwner } = useAuth()

  const features = [
    { icon: '👥', name: 'عدد المستخدمين', free: 'حتى 3', pro: 'غير محدود' },
    { icon: '👨‍👩‍👧‍👦', name: 'عدد الأسر', free: 'حتى 100', pro: 'غير محدود' },
    { icon: '🏕️', name: 'عدد المخيمات', free: 'مخيم 1', pro: 'غير محدود' },
    { icon: '💾', name: 'تصدير البيانات', free: '❌', pro: '✅' },
    { icon: '💬', name: 'رسائل SMS', free: '❌', pro: '✅' },
    { icon: '📈', name: 'التقارير المتقدمة', free: 'محدودة', pro: 'كاملة' },
    { icon: '🔒', name: 'الدعم الفني', free: 'مجتمع', pro: 'أولوية' },
  ]

  return (
    <div>
      <PageHeader icon="💎" title="الاشتراك والباقات" />

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { name: 'مجاني', price: '0 ر.س', color: 'muted', period: 'دائماً' },
          { name: 'Pro', price: '99 ر.س', color: 'accent', period: 'شهرياً', badge: 'موصى به' },
        ].map(plan => (
          <div key={plan.name} className={`bg-surface border-2 ${plan.color === 'accent' ? 'border-accent' : 'border-border'} rounded-2xl p-4 text-center`}>
            {plan.badge && <div className="bg-accent text-bg text-[9px] font-black px-2 py-0.5 rounded-full mb-2 inline-block">{plan.badge}</div>}
            <div className={`text-base font-black text-${plan.color} mb-1`}>{plan.name}</div>
            <div className="text-white text-xl font-black">{plan.price}</div>
            <div className="text-muted text-[10px]">{plan.period}</div>
          </div>
        ))}
      </div>

      <Card title="مقارنة الباقات" icon="📊">
        <div className="flex flex-col gap-0">
          <div className="grid grid-cols-3 text-[10px] font-black text-muted pb-2 mb-2 border-b border-border">
            <span>الميزة</span><span className="text-center">مجاني</span><span className="text-center text-accent">Pro</span>
          </div>
          {features.map(f => (
            <div key={f.name} className="grid grid-cols-3 text-xs py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-1.5"><span>{f.icon}</span><span className="text-muted">{f.name}</span></div>
              <div className="text-center text-muted">{f.free}</div>
              <div className="text-center text-accent font-bold">{f.pro}</div>
            </div>
          ))}
        </div>
      </Card>

      {isOwner && (
        <button className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm mt-2">
          🚀 الترقية إلى Pro
        </button>
      )}
    </div>
  )
}
