import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const SUPA_URL = 'https://ojclpkenecicujkqhhlu.supabase.co'

export default function LoginPage() {
  const [id,       setId]       = useState('')
  const [pass,     setPass]     = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [seconds,  setSeconds]  = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [lockUntil,setLockUntil]= useState(0)
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const timerRef   = useRef(null)

  function startTimer() {
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }
  function stopTimer() {
    clearInterval(timerRef.current)
    setSeconds(0)
  }
  useEffect(() => () => clearInterval(timerRef.current), [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (Date.now() < lockUntil) {
      const wait = Math.ceil((lockUntil - Date.now()) / 1000)
      setError(`⏳ انتظر ${wait} ثانية قبل المحاولة مجدداً`)
      return
    }
    if (!id.trim() || !pass) return setError('أدخل رقم الهوية وكلمة المرور')

    setLoading(true)
    startTimer()
    setError('🔄 جارٍ الاتصال بالخادم...')

    try {
      await signIn(id.trim(), pass)
      setError('✅ تم! جارٍ التحميل...')
      stopTimer()
      navigate('/', { replace: true })
    } catch(err) {
      stopTimer()
      const n = attempts + 1
      setAttempts(n)
      if (n >= 5) setLockUntil(Date.now() + 60000)
      else if (n >= 3) setLockUntil(Date.now() + 15000)
      const msg = err?.message || 'خطأ غير معروف'
      setError('❌ ' + msg)
    } finally {
      setLoading(false)
    }
  }

  // رسائل تشجيعية أثناء الانتظار
  const waitMsg =
    seconds < 3  ? 'جارٍ الاتصال...' :
    seconds < 8  ? 'جارٍ التحقق من بيانات الدخول...' :
    seconds < 14 ? 'الخادم يستجيب، انتظر قليلاً...' :
    'الاتصال بطيء، لا تزال المحاولة جارية...'

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 shadow-2xl">

        {/* أيقونة */}
        <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5">🏕️</div>
        <h1 className="text-white font-black text-xl text-center mb-1">نبض المخيم</h1>
        <p className="text-muted text-xs text-center mb-7">سجل دخول للمتابعة</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">رقم الهوية</label>
            <input type="tel" value={id} onChange={e => setId(e.target.value)}
              placeholder="1xxxxxxxxx" inputMode="numeric"
              disabled={loading}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm placeholder-muted focus:outline-none focus:border-accent disabled:opacity-60"
              autoFocus />
          </div>

          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">كلمة المرور</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm placeholder-muted focus:outline-none focus:border-accent disabled:opacity-60" />
          </div>

          {/* رسالة الحالة */}
          {error && (
            <p className={`text-xs rounded-lg px-3 py-2 ${
              error.startsWith('✅') ? 'text-green bg-green/10 border border-green/20' :
              error.startsWith('❌') ? 'text-red   bg-red/10   border border-red/20'   :
                                       'text-accent bg-accent/10 border border-accent/20'
            }`}>
              {error}
            </p>
          )}

          {/* عداد الوقت أثناء الانتظار */}
          {loading && seconds > 0 && (
            <div className="text-center">
              <div className="text-accent text-xs font-bold mb-1">{waitMsg}</div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-full bg-surface2 rounded-full h-1.5">
                  <div className="bg-accent h-1.5 rounded-full transition-all"
                    style={{width:`${Math.min(100, seconds/20*100)}%`}}/>
                </div>
                <span className="text-muted text-xs w-8 text-left">{seconds}s</span>
              </div>
            </div>
          )}

          <button type="submit" disabled={loading || Date.now() < lockUntil}
            className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm mt-1 disabled:opacity-60 active:scale-95 transition-transform">
            {loading ? `⏳ جاري الدخول... (${seconds}s)` : 'تسجيل الدخول'}
          </button>
        </form>

        <p className="text-muted text-xs text-center mt-6">كلمة المرور الأولى = رقم الجوال</p>

        {/* تلميح عند البطء */}
        {seconds > 10 && (
          <div className="mt-4 p-3 bg-surface2 rounded-xl border border-border">
            <p className="text-muted text-[11px] text-center leading-relaxed">
              الخادم بطيء. إذا استمر الانتظار أكثر من 20 ثانية سيظهر خطأ — حاول مرة أخرى.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
