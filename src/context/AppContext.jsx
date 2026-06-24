import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useSyncStatus } from './PowerSyncContext'
import { ORG_ID, supabase, canUserReviewRequest, fetchPendingRequests } from '../lib/db'
import { useAuth } from './AuthContext'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [toast,  setToast]  = useState(null)
  const { psReady, psSynced, psStatus } = useSyncStatus()
  const { profile, isOwner } = useAuth()
  const lastKnownPending = useRef(null) // null = لم يُفحص بعد (لا تُنبِّه عند أول تحميل)

  // مراقبة الإنترنت — Supabase مباشر لا يحتاج معالجة قائمة انتظار
  useEffect(() => {
    const onOnline  = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Supabase مباشر: لا حاجة لـ Delta Sync polling — كل query يقرأ مباشرة من السيرفر

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // تنبيه فوري داخل التطبيق — لا حاجة لـ Push/Service Worker، يعمل طالما التطبيق مفتوح.
  // فحص خفيف كل 45 ثانية لمن يحق له مراجعة شيء (طلبات أسر/حركات + أجهزة)؛ يُطلق
  // toast فقط عند ازدياد العدد عن آخر فحص (لا يُكرَّر التنبيه لنفس الطلبات القديمة).
  useEffect(() => {
    if (!profile || !(isOwner || profile.can_review_approvals)) return
    let cancelled = false

    async function checkPending() {
      if (!navigator.onLine) return
      try {
        const [reqRows, devRows, members] = await Promise.all([
          fetchPendingRequests(),
          supabase.from('devices').select('user_id').eq('org_id', ORG_ID).eq('is_approved', false).eq('is_blocked', false),
          isOwner ? Promise.resolve([]) : supabase.from('org_members').select('*').eq('org_id', ORG_ID).then(r => r.data || []),
        ])
        const byUserId = Object.fromEntries(members.map(m => [m.user_id, m]))
        const visibleReq = isOwner ? reqRows : reqRows.filter(r => canUserReviewRequest(profile, byUserId[r.changed_by]))
        const visibleDev = isOwner ? (devRows.data || []) : (devRows.data || []).filter(d => canUserReviewRequest(profile, byUserId[d.user_id]))
        const total = visibleReq.length + visibleDev.length

        if (!cancelled) {
          if (lastKnownPending.current !== null && total > lastKnownPending.current) {
            showToast(`📋 ${total - lastKnownPending.current} طلب جديد بانتظار موافقتك`)
          }
          lastKnownPending.current = total
        }
      } catch (e) { console.warn('[pending-poll]', e.message) }
    }

    checkPending()
    const interval = setInterval(checkPending, 45000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [profile, isOwner, showToast])

  // Supabase مباشر: لا قائمة انتظار محلية، لا حاجة لـ pendingSync

  return (
    <AppContext.Provider value={{ online, toast, showToast, psReady, psSynced, psStatus }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
