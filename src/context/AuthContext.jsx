import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, ORG_ID } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [profile, setProfile]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [mustChange, setMustChange] = useState(false)

  useEffect(() => {
    // استرجاع الجلسة الحالية
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // الاستماع لتغييرات المصادقة
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('org_members')
        .select('*')
        .eq('user_id', userId)
        .eq('org_id', ORG_ID)
        .single()

      if (error) throw error
      setProfile(data)

      // فحص must_change_pass من meta
      const { data: meta } = await supabase.auth.getUser()
      const userMeta = meta?.user?.user_metadata || {}
      setMustChange(!!userMeta.must_change_pass)
    } catch (err) {
      console.error('fetchProfile error:', err)
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
    await supabase.auth.signOut()
  }

  // ======== صلاحيات ========
  const role = profile?.role
  const isOwner        = role === 'platform_owner'
  const isSuperAdmin   = role === 'super_admin' || isOwner
  const isCampDelegate = role === 'camp_delegate' || isSuperAdmin
  const isAssistant    = role === 'assistant'

  const canWrite  = isOwner || isSuperAdmin || isCampDelegate || profile?.can_add
  const canEdit   = isOwner || isSuperAdmin || isCampDelegate || profile?.can_edit
  const canDelete = isOwner || isSuperAdmin || profile?.can_delete
  const canExport = isOwner || isSuperAdmin || profile?.can_export
  const canImport = isOwner || isSuperAdmin || profile?.can_import

  const value = {
    user, profile, loading, mustChange, setMustChange,
    role, isOwner, isSuperAdmin, isCampDelegate, isAssistant,
    canWrite, canEdit, canDelete, canExport, canImport,
    signIn, signOut, refetchProfile: () => user && fetchProfile(user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
