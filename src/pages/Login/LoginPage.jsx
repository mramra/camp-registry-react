import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function LoginPage() {
  const [id, setId] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lockUntil, setLockUntil] = useState(0)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (Date.now() < lockUntil) {
      setError('محاولات كثيرة. انتظر قليلاً')
      return
    }
    if (!id.trim() || !pass) return setError('أدخل رقم الهوية وكلمة المرور')
    setLoading(true)
    setError('')
    try {
      await signIn(id.trim(), pass)
      navigate('/', { replace: true })
    } catch {
      const n = attempts + 1
      setAttempts(n)
      if (n >= 5) setLockUntil(Date.now() + 60000)
      else if (n >= 3) setLockUntil(Date.now() + 15000)
      setError('رقم الهوية أو كلمة المرور غير صحيحة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 shadow-2xl">
        <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5">🏕️</div>
        <h1 className="text-white font-black text-xl text-center mb-1">نبض المخيم</h1>
        <p className="text-muted text-xs text-center mb-7">سجل دخول للمتابعة</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">رقم الهوية</label>
            <input type="tel" value={id} onChange={e => setId(e.target.value)} placeholder="1xxxxxxxxx" inputMode="numeric"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm placeholder-muted focus:outline-none focus:border-accent" autoFocus />
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">كلمة المرور</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm placeholder-muted focus:outline-none focus:border-accent" />
          </div>
          {error && <p className="text-red text-xs bg-red/10 border border-red/20 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm mt-1 disabled:opacity-60">
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
        <p className="text-muted text-xs text-center mt-6">كلمة المرور الأولى = رقم الجوال</p>
      </div>
    </div>
  )
}
