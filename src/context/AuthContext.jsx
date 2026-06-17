import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, ORG_ID } from '../lib/supabase'
import { hasPermission, hasPagePermission, getCampFilter } from '../lib/permissions'
import { loadPagePermissions, canAccessPageSync } from '../lib/pagePermissions'

const AuthContext = createContext(null)
const PROFILE_KEY = 'camp_profile'
const SUPA_URL    = 'https://ojclpkenecicujkqhhlu.supabase.co'

// يمنع تكرار quickSync لو أُطلق initAuth وonAuthStateChange بنفس اللحظة لنفس فتحة التطبيق
let appSyncTriggered = false
function triggerAppSync() {
  if (appSyncTriggered) return
  if (!navigator.onLine) return
  appSyncTriggered = true
  import('../lib/syncAll').then(({ quickSync }) =>
    quickSync().catch(e => console.warn('[app-open] sync:', e.message))
  )
}

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
  const [pagePermRows, setPagePermRows] = useState([])
  const [pagePermLoaded, setPagePermLoaded] = useState(false)

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
        triggerAppSync() // سحب كل الجداول محلياً عند فتح التطبيق وهو موصول بالنت
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
        triggerAppSync() // محمي بحارس appSyncTriggered — لن يتكرر لو نُفّذ في initAuth أعلاه
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
    // ① SQLite أولاً (فوري)
    try {
      const { getPowerSync } = await import('../lib/powersync')
      const db = getPowerSync()
      if (db) {
        const rows = await db.getAll(
          `SELECT * FROM org_members WHERE user_id = ? AND org_id = ?`,
          [userId, ORG_ID]
        )
        if (rows?.length) {
          setProfile(rows[0])
          localStorage.setItem(PROFILE_KEY, JSON.stringify(rows[0]))
          setLoading(false)
        }
      }
    } catch {}

    // ② Supabase في الخلفية مع timeout
    if (!navigator.onLine) { setLoading(false); setPagePermLoaded(true); return }
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
        try {
          const { getPowerSync } = await import('../lib/powersync')
          const db = getPowerSync()
          if (db) {
            const ALLOWED = ['id','org_id','user_id','full_name','role','phone','camp_id',
              'can_add','can_edit','can_delete','can_export','can_import','is_active',
              'created_at','updated_at']
            const cols = Object.keys(p).filter(k => ALLOWED.includes(k) && p[k] !== undefined)
            const vals = cols.map(k => (p[k] !== null && typeof p[k] === 'object') ? JSON.stringify(p[k]) : p[k])
            if (cols.length) {
              await db.execute(
                `INSERT OR REPLACE INTO org_members (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,
                vals
              )
            }
          }
        } catch {}
        const { data: meta } = await supabase.auth.getUser()
        setMustChange(!!(meta?.user?.user_metadata?.must_change_pass))
        // حمّل صلاحيات الصفحات (دور + استثناءات فردية) — لا تعيق تحميل الصفحة
        loadPagePermissions().then(rows => { setPagePermRows(rows); setPagePermLoaded(true) }).catch(() => setPagePermLoaded(true))
      } else {
        setPagePermLoaded(true) // لا بروفايل — لا حاجة لانتظار صلاحيات
      }
    } catch {
      setPagePermLoaded(true) // فشل/timeout — لا تُبقِ الحماية بانتظار أبدي
    }
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
    appSyncTriggered = true // سنسحب الآن مباشرة — لا حاجة لتكرار من onAuthStateChange
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
    appSyncTriggered = false // يسمح بسحب كامل جديد عند دخول مستخدم آخر بنفس الجلسة
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
  // فحص صلاحية صفحة معيّنة بمنطق الأولوية (استثناء مستخدم > دور > افتراضي)
  const canAccessPageNow = (pageKey) => canAccessPageSync(effectiveProfile, pageKey, pagePermRows)

  const value = {
    user, profile: effectiveProfile, effectiveProfile, realProfile: profile,
    loading, mustChange, setMustChange, previewAs, setPreviewAs,
    isPreviewMode: !!previewAs,
    role, isOwner, isSuperAdmin, isCampDelegate, isAssistant,
    canWrite, canEdit, canDelete, canExport, canImport,
    can, canPage, campFilter,
    pagePermRows, pagePermLoaded, canAccessPageNow,
    refetchPagePermissions: () => loadPagePermissions().then(setPagePermRows),
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
