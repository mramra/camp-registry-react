/**
 * routes/index.jsx — تعريف كل المسارات مركزياً
 * مثل routes/web.php في Laravel
 *
 * الاستخدام في App.jsx:
 *   import { appRoutes } from './routes'
 */
import { lazy } from 'react'
import { Navigate } from 'react-router-dom'

// ── Lazy imports (code splitting) ─────────────────────────
const Dashboard      = lazy(() => import('../pages/Dashboard/Dashboard'))
const FamiliesList   = lazy(() => import('../pages/Families/FamiliesList'))
const FamilyForm     = lazy(() => import('../pages/Families/FamilyForm'))
const CampsList      = lazy(() => import('../pages/Camps/CampsList'))
const UsersList      = lazy(() => import('../pages/Users/UsersList'))
const Movements      = lazy(() => import('../pages/Movements/Movements'))
const Distributions  = lazy(() => import('../pages/Distributions/Distributions'))
const RegistersPage  = lazy(() => import('../pages/Registers/RegistersPage'))
const Analysis       = lazy(() => import('../pages/Analysis/Analysis'))
const ExportPage     = lazy(() => import('../pages/Export/ExportPage'))
const DataPage       = lazy(() => import('../pages/Data/DataPage'))
const LoginPage      = lazy(() => import('../pages/Login/LoginPage'))

/**
 * تعريف المسارات
 * middleware: 'auth' | 'owner' | 'admin' | 'reports' | 'can:export'
 */
export const routes = [
  // ── عام ─────────────────────────────────────────────────
  { path: '/login', element: LoginPage, public: true },

  // ── الرئيسية ─────────────────────────────────────────────
  { path: '/',          element: Dashboard,    middleware: 'auth' },

  // ── الأسر ───────────────────────────────────────────────
  { path: '/families',           element: FamiliesList, middleware: 'auth', pageKey: 'page-families' },
  { path: '/families/add',       element: FamilyForm,   middleware: 'can:write' },
  { path: '/families/edit/:id',  element: FamilyForm,   middleware: 'can:edit' },

  // ── المخيمات ──────────────────────────────────────────────
  { path: '/camps',     element: CampsList,    middleware: 'auth' },

  // ── العمليات ─────────────────────────────────────────────
  { path: '/movements',      element: Movements,     middleware: 'auth', pageKey: 'page-movements' },
  { path: '/distributions',  element: Distributions, middleware: 'auth', pageKey: 'page-dist' },
  { path: '/registers',      element: RegistersPage, middleware: 'auth', pageKey: 'page-children' },

  // ── التقارير ─────────────────────────────────────────────
  { path: '/analysis', element: Analysis,    middleware: 'can:reports' },
  { path: '/export',   element: ExportPage,  middleware: 'can:export' },

  // ── الإدارة ──────────────────────────────────────────────
  { path: '/users',    element: UsersList,   middleware: 'admin' },
  { path: '/data',     element: DataPage,    middleware: 'owner' },

  // ── fallback ─────────────────────────────────────────────
  { path: '*', redirect: '/' },
]

/**
 * قاموس middleware
 */
export const MIDDLEWARE = {
  'auth':        (auth) => !!auth.profile,
  'owner':       (auth) => auth.isOwner,
  'admin':       (auth) => auth.isSuperAdmin || auth.isOwner,
  'can:write':   (auth) => auth.canWrite,
  'can:edit':    (auth) => auth.canEdit,
  'can:delete':  (auth) => auth.canDelete,
  'can:reports': (auth) => auth.can('reports'),
  'can:export':  (auth) => auth.canExport,
}
