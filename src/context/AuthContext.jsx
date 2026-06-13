import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, ORG_ID } from '../lib/supabase'
import { localDB } from '../lib/db'

const AuthContext  = createContext(null)
const PROFILE_KEY  = 'camp_profile'

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null)
  const [profile,    setProfile]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [mustChange, setMustChange] = useState(false)
  const [previewAs,  setPreviewAs]  = useState(null)

  useEffect(() => { initAuth() }, [])

  async function initAuth() {
    // ① كاش فوري
    try {
      const cached = localStorage.getItem(PROFILE_KEY)
      if (cached) {
        setProfile(JSON.parse(cached))
        setLoading(false)  // أظهر التطبيق فوراً
      }
    } catch {}

    // ② Session من Supabase مع timeout 3 ثواني
    let session = null
    try {
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))
      ])
      session = result?.data?.session
    } catch {
      // timeout أو offline — استخدم الكاش
      setLoading(false)
      return
    }

    if (session?.user) {
      setUser(session.user)
      fetchProfile(session.user.id)  // بدون await
    } else {
      localStorage.removeItem(PROFILE_KEY)
      setProfile(null)
      setLoading(false)
    }

    // ③ استمع لتغييرات المصادقة
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
    // أظهر فوراً إذا كاش موجود
    const cached = localStorage.getItem(PROFILE_KEY)
    if (cached) {
      try {
        const p = JSON.parse(cached)
        setProfile(p)
        setLoading(false)
      } catch {}
    }

    // جلب من Supabase في الخلفية
    try {
      const { data, error } = await supabase
        .from('org_members')
        .select('*')
        .eq('user_id', userId)
        .eq('org_id', ORG_ID)
        .single()

      if (!error && data) {
        setProfile(data)
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data))
        try { await localDB.org_members.put(data) } catch {}
      }
    } catch (err) {
      console.warn('[fetchProfile]', err.message)
    } finally {
      setLoading(false)  // دائماً false في النهاية
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
    setPreviewAs(null)
    await supabase.auth.signOut()
  }

  const effectiveProfile = previewAs || profile
  const role             = effectiveProfile?.role
  const isOwner          = role === 'platform_owner'
  const isSuperAdmin     = role === 'super_admin'   || isOwner
  const isCampDelegate   = role === 'camp_delegate' || isSuperAdmin
  const isAssistant      = role === 'assistant'

  const canWrite  = isOwner || isSuperAdmin || isCampDelegate || effectiveProfile?.can_add
  const canEdit   = isOwner || isSuperAdmin || isCampDelegate || effectiveProfile?.can_edit
  const canDelete = isOwner || isSuperAdmin || effectiveProfile?.can_delete
  const canExport = isOwner || isSuperAdmin || effectiveProfile?.can_export
  const canImport = isOwner || isSuperAdmin || effectiveProfile?.can_import

  return (
    <AuthContext.Provider value={{
      user, profile: effectiveProfile, effectiveProfile,
      realProfile: profile, loading, mustChange, setMustChange,
      previewAs, setPreviewAs, isPreviewMode: !!previewAs,
      role, isOwner, isSuperAdmin, isCampDelegate, isAssistant,
      canWrite, canEdit, canDelete, canExport, canImport,
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
