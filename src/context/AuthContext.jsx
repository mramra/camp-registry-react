import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, ORG_ID } from '../lib/supabase'
import { localDB } from '../lib/db'

const AuthContext = createContext(null)
const PROFILE_KEY = 'camp_profile'

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null)
  const [profile, setProfile]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [mustChange, setMustChange] = useState(false)
  const [previewAs, setPreviewAs]   = useState(null)

  useEffect(() => {
    initAuth()
  }, [])

  async function initAuth() {
    // ── أولاً: تحقق من الجلسة المحلية فوراً ──
    try {
      const cached = localStorage.getItem(PROFILE_KEY)
      if (cached) {
        const p = JSON.parse(cached)
        setProfile(p)
        setLoading(false)  // أظهر التطبيق فوراً من الكاش
      }
    } catch {}

    // ── ثانياً: getSession مع timeout ──
    try {
      const sessionPromise = supabase.auth.getSession()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      )
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise])

      if (session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id)
      } else {
        // لا جلسة → امسح الكاش وأظهر Login
        localStorage.removeItem(PROFILE_KEY)
        setProfile(null)
        setLoading(false)
      }
    } catch (err) {
      // timeout أو خطأ شبكة → استخدم الكاش إذا موجود
      const cached = localStorage.getItem(PROFILE_KEY)
      if (!cached) {
        setProfile(null)
        setLoading(false)
      }
      // إذا كاش موجود → loading=false تم أعلاه، التطبيق يعمل أوف لاين
      console.warn('[auth] offline mode:', err.message)
    }

    // ── ثالثاً: استمع لتغييرات المصادقة ──
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        localStorage.removeItem(PROFILE_KEY)
        setLoading(false)
      }
    })
  }

  async function fetchProfile(userId) {
    try {
      // ① Dexie أولاً
      const localMembers = await localDB.org_members
        .filter(m => m.user_id === userId && m.org_id === ORG_ID)
        .toArray().catch(() => [])
      if (localMembers.length) {
        const p = localMembers[0]
        setProfile(p)
        localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
        setLoading(false)
      }

      // ② Supabase في الخلفية
      if (!navigator.onLine) return
      const { data: members, error } = await supabase
        .from('org_members')
        .select('*')
        .eq('user_id', userId)
        .eq('org_id', ORG_ID)
        .eq('is_active', true)
        .limit(1)

      const data = members?.[0]
      if (!error && data) {
        setProfile(data)
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data))
        try { await localDB.org_members.put(data) } catch {}
        const { data: meta } = await supabase.auth.getUser()
        const userMeta = meta?.user?.user_metadata || {}
        setMustChange(!!userMeta.must_change_pass)
      } else if (error) {
        console.warn('[fetchProfile] error:', error.message)
      }
    } catch (err) {
      console.warn('[fetchProfile]', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(nationalId, password) {
    const email = `${nationalId}@c.co`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    localStorage.removeItem(PROFILE_KEY)
    await supabase.auth.signOut()
  }

  // ======== صلاحيات ========
  const effectiveProfile = previewAs || profile
  const role = effectiveProfile?.role
  const isOwner        = role === 'platform_owner'
  const isSuperAdmin   = role === 'super_admin' || isOwner
  const isCampDelegate = role === 'camp_delegate' || isSuperAdmin
  const isAssistant    = role === 'assistant'

  const canWrite  = isOwner || isSuperAdmin || isCampDelegate || effectiveProfile?.can_add
  const canEdit   = isOwner || isSuperAdmin || isCampDelegate || effectiveProfile?.can_edit
  const canDelete = isOwner || isSuperAdmin || effectiveProfile?.can_delete
  const canExport = isOwner || isSuperAdmin || effectiveProfile?.can_export
  const canImport = isOwner || isSuperAdmin || effectiveProfile?.can_import

  const value = {
    user,
    profile: effectiveProfile,
    effectiveProfile,
    realProfile: profile,
    loading, mustChange, setMustChange,
    previewAs, setPreviewAs,
    isPreviewMode: !!previewAs,
    role, isOwner, isSuperAdmin, isCampDelegate, isAssistant,
    canWrite, canEdit, canDelete, canExport, canImport,
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
