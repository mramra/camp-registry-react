import { Component } from 'react'

/**
 * ErrorBoundary — يمنع انهيار التطبيق عند خطأ في أي صفحة
 * يعرض واجهة بديلة بدلاً من شاشة بيضاء
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    // يمكن إرسال الخطأ لخدمة مراقبة مثل Sentry
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const msg = this.state.error?.message || 'خطأ غير معروف'
    const isChunkError = msg.includes('Loading chunk') || msg.includes('Failed to fetch')

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="text-5xl mb-4">{isChunkError ? '📡' : '⚠️'}</div>
        <h2 className="text-white font-black text-lg mb-2">
          {isChunkError ? 'تعذر تحميل الصفحة' : 'حدث خطأ غير متوقع'}
        </h2>
        <p className="text-muted text-sm mb-6 max-w-xs">
          {isChunkError
            ? 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة'
            : msg.slice(0, 120)}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="bg-accent text-bg font-black px-5 py-2.5 rounded-xl text-sm"
          >
            🔄 إعادة المحاولة
          </button>
          <button
            onClick={() => window.location.href = '/camp-registry-react/'}
            className="bg-surface2 border border-border text-white font-bold px-5 py-2.5 rounded-xl text-sm"
          >
            🏠 الرئيسية
          </button>
        </div>
        {import.meta.env.DEV && (
          <details className="mt-4 text-left text-xs text-muted max-w-sm">
            <summary className="cursor-pointer text-accent">تفاصيل الخطأ (dev)</summary>
            <pre className="mt-2 bg-surface2 p-3 rounded-xl overflow-auto text-[10px]">
              {this.state.error?.stack?.slice(0, 500)}
            </pre>
          </details>
        )}
      </div>
    )
  }
}
