import { useSyncStatus } from '../../context/PowerSyncContext'

/**
 * يُعرض فوق كل التطبيق عند انقطاع الإنترنت.
 * التطبيق يعتمد كلياً على Supabase — لا عمل بدون اتصال.
 */
export default function OfflineBanner() {
  const { isOnline } = useSyncStatus()
  if (isOnline) return null

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-bg/95 backdrop-blur-sm">
      <div className="max-w-sm text-center p-6">
        <div className="text-5xl mb-4">📡</div>
        <h2 className="text-white font-black text-lg mb-2">لا يوجد اتصال بالإنترنت</h2>
        <p className="text-muted text-sm leading-relaxed">
          هذا التطبيق يحتاج اتصالاً بالإنترنت للعمل.
          تأكد من تفعيل الوايفاي أو بيانات الهاتف، وسيعود التطبيق للعمل تلقائياً.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 text-accent text-xs">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
          جاري الانتظار...
        </div>
      </div>
    </div>
  )
}
