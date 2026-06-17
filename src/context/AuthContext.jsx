import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, ORG_ID } from '../lib/supabase'
import { localDB } from '../lib/db'
import { hasPermission, hasPagePermission, getCampFilter } from '../lib/permissions'

const AuthContext = createContext(null)
const PROFILE_KEY = 'camp_profile'
const SUPA_URL    = 'https://ojclpkenecicujkqhhlu.supabase.co'

// وظيفة مساعدة: أي promise مع timeout
function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ])
}

export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null)
  const [profile,   setProfile]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [mustChange,setMustChange]= useState(false)
  const [previewAs, setPreviewAs] = useState(null)

  useEffect(() => { initAuth() }, [])

  async function initAuth() {
    // ① استخدم الكاش فوراً
    try {
      const cached = localStorage.getItem(PROFILE_KEY)
      if (cached) {
        setProfile(JSON.parse(cached))
        setLoading(false)
      }
    } catch {}

    // ② تحقق من الجلسة مع timeout
    try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        6000, 'timeout'
      )
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        localStorage.removeItem(PROFILE_KEY)
        setProfile(null)
        setLoading(false)
      }
    } catch {
      // timeout أو أوف لاين — استخدم الكاش
      if (!localStorage.getItem(PROFILE_KEY)) setLoading(false)
    }

    // ③ مراقبة تغييرات الجلسة
    supabase.auth.onAuthStateChange((_ev, session) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
        // ربط PowerSync الكامل — غير معيق، بعد تأخير بسيط
        setTimeout(() => {
          import('../lib/powersync').then(({ connectPowerSync }) =>
            connectPowerSync().catch(() => {})
          )
        }, 2000)
      } else {
        setUser(null); setProfile(null)
        localStorage.removeItem(PROFILE_KEY)
        setLoading(false)
        // اقطع PowerSync
        import('../lib/powersync').then(({ disconnectPowerSync }) =>
          disconnectPowerSync().catch(() => {})
        )
      }
    })
  }

  async function fetchProfile(userId) {
    // ① Dexie أولاً (فوري)
    try {
      const local = await localDB.org_members
        .filter(m => m.user_id === userId && m.org_id === ORG_ID)
        .toArray().catch(() => [])
      if (local.length) {
        setProfile(local[0])
        localStorage.setItem(PROFILE_KEY, JSON.stringify(local[0]))
        setLoading(false)
      }
    } catch {}

    // ② Supabase في الخلفية مع timeout
    if (!navigator.onLine) { setLoading(false); return }
    try {
      const { data: members, error } = await withTimeout(
        supabase.from('org_members').select('*')
          .eq('user_id', userId).eq('org_id', ORG_ID).limit(1),
        10000, 'profile_timeout'
      )
      const p = members?.[0]
      if (!error && p) {
        setProfile(p)
        localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
        try { await localDB.org_members.put(p) } catch {}
        const { data: meta } = await supabase.auth.getUser()
        setMustChange(!!(meta?.user?.user_metadata?.must_change_pass))
      }
    } catch {}
    setLoading(false)
  }

  async function signIn(nationalId, password) {
    const email = `${nationalId}@c.co`

    // أيقظ Supabase أولاً (ping خفيف) 
    try {
      await withTimeout(
        fetch(`${SUPA_URL}/auth/v1/health`),
        3000, 'ping_timeout'
      )
    } catch {}

    // تسجيل الدخول مع timeout 20 ثانية
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      20000,
      'انتهت مهلة الاتصال (20 ثانية)\n\nتحقق من اتصالك بالإنترنت وحاول مرة أخرى'
    )
    if (error) throw error

    // ── مزامنة فورية + إعادة ضبط Delta Sync ─────────────────
    import('../lib/syncAll').then(({ quickSync }) =>
      quickSync().catch(e => console.warn('[login] sync:', e.message))
    )
    import('../lib/deltaSync').then(({ resetDeltaSync }) => resetDeltaSync())

    return data
  }

  async function signOut() {
    // اقطع PowerSync أولاً
    import('../lib/powersync').then(({ disconnectPowerSync }) =>
      disconnectPowerSync().catch(() => {})
    )
    localStorage.removeItem(PROFILE_KEY)
    try { await supabase.auth.signOut() } catch {}
  }

  const effectiveProfile = previewAs || profile
  const role = effectiveProfile?.role
  const isOwner        = role === 'platform_owner'
  const isSuperAdmin   = role === 'super_admin' || isOwner
  const isCampDelegate = role === 'camp_delegate' || isSuperAdmin
  const isAssistant    = role === 'assistant'

  // صلاحيات مبنية على permissions.js
  const can = (action) => hasPermission(effectiveProfile, action)
  const canPage = (pageKey, op='view') => hasPagePermission(effectiveProfile, pageKey, op)
  const canWrite  = can('write')
  const canEdit   = can('edit')
  const canDelete = can('delete')
  const canExport = can('export')
  const canImport = can('import')
  const campFilter = getCampFilter(effectiveProfile)

  const value = {
    user, profile: effectiveProfile, effectiveProfile, realProfile: profile,
    loading, mustChange, setMustChange, previewAs, setPreviewAs,
    isPreviewMode: !!previewAs,
    role, isOwner, isSuperAdmin, isCampDelegate, isAssistant,
    canWrite, canEdit, canDelete, canExport, canImport,
    can, canPage, campFilter,
    signIn, signOut,
    refetchProfile: () => user && fetchProfile(user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
