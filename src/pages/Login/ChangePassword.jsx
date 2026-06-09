import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ChangePassword() {
  const [newPass, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setMustChange } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPass.length < 8) return setError('كلمة المرور 8 أحرف على الأقل')
    if (newPass !== confirm) return setError('كلمتا المرور غير متطابقتين')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPass, data: { must_change_pass: false } })
      if (err) throw err
      setMustChange(false)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8">
        <div className="text-4xl text-center mb-4">🔐</div>
        <h2 className="text-white font-black text-lg text-center mb-6">تغيير كلمة المرور</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input type="password" value={newPass} onChange={e => setNew(e.target.value)} placeholder="كلمة المرور الجديدة"
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent" />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="تأكيد كلمة المرور"
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent" />
          {error && <p className="text-red text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
            {loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
          </button>
        </form>
      </div>
    </div>
  )
}
