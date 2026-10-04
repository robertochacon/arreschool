import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { AppRouter } from '@/lib/router'
import { useAuth } from '@/auth/AuthProvider'
import { Layout } from '@/components/Layout'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/ui/misc'
import { LEGAL_PATHS } from '@/lib/constants'
import { usePermissions, type Permission } from '@/lib/permissions'

// Las pantallas de autenticación van en el bundle principal (sin lazy): son lo
// PRIMERO que ve quien no tiene sesión, y diferirlas añade un viaje de red justo
// en el momento en que la app todavía no ha demostrado nada.
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { OnboardingPage } from '@/pages/auth/OnboardingPage'

/** Guard anti-bucle de recarga. DEBE ser la MISMA clave que usa main.tsx. */
const CHUNK_RELOAD_KEY = 'arreschool-chunk-reloaded'

/**
 * `lazy()` que se recupera de un chunk que no carga.
 *
 * El caso real: tras un deploy, el service worker sirve un index.html viejo que
 * apunta a hashes que ya no existen en el servidor, así que el `import()` falla
 * y la pantalla se queda en blanco para siempre. Aquí se recarga UNA vez para
 * traer el HTML y los chunks frescos. El guard en sessionStorage evita el bucle
 * de recargas; si tras recargar sigue fallando, el error se propaga al
 * <ErrorBoundary> y al menos se ve "Algo salió mal" en vez de nada. Al cargar
 * bien, el guard se limpia para que la próxima vez vuelva a haber un intento.
 */
function lazyWithRetry<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory()
      .then((m) => {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY)
        return m
      })
      .catch((err) => {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
          window.location.reload()
          // Se queda colgada a propósito (ni resuelve ni rechaza) hasta que la
          // recarga tome efecto: resolver aquí pintaría un error de un instante.
          return new Promise<{ default: T }>(() => {})
        }
        throw err
      }),
  )
}

// El resto de pantallas sí van en carga diferida: quien entra sin sesión no paga
// el peso del panel de super-admin ni el de la app completa.
const DashboardPage = lazyWithRetry(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const StudentsPage = lazyWithRetry(() =>
  import('@/features/students/StudentsPage').then((m) => ({ default: m.StudentsPage })),
)
const StudentDetailPage = lazyWithRetry(() =>
  import('@/features/students/StudentDetailPage').then((m) => ({ default: m.StudentDetailPage })),
)
const FamiliesPage = lazyWithRetry(() =>
  import('@/features/families/FamiliesPage').then((m) => ({ default: m.FamiliesPage })),
)
const EnrollmentsPage = lazyWithRetry(() =>
  import('@/features/academic/EnrollmentsPage').then((m) => ({ default: m.EnrollmentsPage })),
)
const AcademicPage = lazyWithRetry(() =>
  import('@/features/academic/AcademicPage').then((m) => ({ default: m.AcademicPage })),
)
const AttendancePage = lazyWithRetry(() =>
  import('@/features/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })),
)
const EvaluationsPage = lazyWithRetry(() =>
  import('@/features/evaluations/EvaluationsPage').then((m) => ({ default: m.EvaluationsPage })),
)
const ReportCardPage = lazyWithRetry(() =>
  import('@/features/evaluations/ReportCardPage').then((m) => ({ default: m.ReportCardPage })),
)
const FinancePage = lazyWithRetry(() =>
  import('@/features/finance/FinancePage').then((m) => ({ default: m.FinancePage })),
)
const ReceiptPage = lazyWithRetry(() =>
  import('@/features/finance/ReceiptPage').then((m) => ({ default: m.ReceiptPage })),
)
const AnnouncementsPage = lazyWithRetry(() =>
  import('@/features/announcements/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })),
)
const ReportsPage = lazyWithRetry(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const UserManualPage = lazyWithRetry(() =>
  import('@/features/help/UserManualPage').then((m) => ({ default: m.UserManualPage })),
)
const SettingsPage = lazyWithRetry(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const ProfilePage = lazyWithRetry(() =>
  import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const AdminPage = lazyWithRetry(() =>
  import('@/features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
)
const AdminTenantDetail = lazyWithRetry(() =>
  import('@/features/admin/AdminTenantDetail').then((m) => ({ default: m.AdminTenantDetail })),
)
const LandingPage = lazyWithRetry(() =>
  import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
)
const PrivacyPage = lazyWithRetry(() =>
  import('@/features/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
)
const TermsPage = lazyWithRetry(() =>
  import('@/features/legal/TermsPage').then((m) => ({ default: m.TermsPage })),
)

/** Arranque de la app: es lo primero que se ve al entrar y al recargar. */
function FullLoader() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-slate-50">
      <Logo className="h-24 w-24 animate-pulse" />
      <div className="flex flex-col items-center gap-3">
        <Spinner size="xl" />
        <p className="text-sm font-medium text-slate-500">Cargando…</p>
      </div>
    </div>
  )
}

/** Solo para quien NO tiene sesión (login, registro, recuperar). */
function PublicOnly({ children }: { children: ReactNode }) {
  const { loading, user, contextReady, needsOnboarding, isPlatformAdmin } = useAuth()
  // Justo tras iniciar sesión hay un instante con sesión pero sin perfil cargado.
  // Esperar aquí evita el rebote «crear negocio → panel»: el destino se decide
  // una sola vez, ya sabiendo si la cuenta tiene negocio.
  if (loading || (user && !contextReady)) return <FullLoader />
  if (user) {
    const to = isPlatformAdmin ? '/admin' : needsOnboarding ? '/bienvenida' : '/'
    return <Navigate to={to} replace />
  }
  return <>{children}</>
}

/** Pantalla de bloqueo para los negocios suspendidos por la plataforma. */
function SuspendedScreen() {
  const { tenant, signOut } = useAuth()
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <Logo className="h-14 w-14 opacity-70" />
      <h1 className="text-lg font-bold text-slate-900">Cuenta suspendida</h1>
      <p className="max-w-sm text-sm text-slate-500">
        El acceso a <span className="font-medium">{tenant?.name}</span> en ArreSchool está temporalmente
        suspendido. Contacta al administrador de la plataforma para reactivarlo.
      </p>
      <button
        onClick={() => signOut()}
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        Cerrar sesión
      </button>
    </div>
  )
}

/** Requiere sesión + negocio configurado. Es el marco de toda la app interna. */
function ProtectedLayout() {
  const { loading, user, contextReady, needsOnboarding, isPlatformAdmin, tenant } = useAuth()
  const location = useLocation()
  if (loading) return <FullLoader />
  // Visitante sin sesión: en la raíz ve la landing pública; en cualquier otra
  // ruta protegida se le manda a iniciar sesión.
  if (!user) {
    if (location.pathname === '/') return <LandingPage />
    return <Navigate to="/login" replace />
  }
  // Con sesión pero sin el perfil cargado: esperar en vez de adivinar. Adivinar
  // aquí manda al onboarding a alguien que sí tiene negocio.
  if (!contextReady) return <FullLoader />
  // Super-admin sin negocio propio: su lugar es el panel de plataforma.
  if (isPlatformAdmin && !tenant) return <Navigate to="/admin" replace />
  if (needsOnboarding) return <Navigate to="/bienvenida" replace />
  if (tenant?.suspended_at) return <SuspendedScreen />
  return <Layout />
}

/** Requiere sesión + ser super-admin de plataforma. */
function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { loading, user, contextReady, isPlatformAdmin } = useAuth()
  if (loading) return <FullLoader />
  if (!user) return <Navigate to="/login" replace />
  // Sin el contexto cargado `isPlatformAdmin` todavía es false, y sin esta espera
  // el super-admin quedaría expulsado de su propio panel cada vez que recargue.
  if (!contextReady) return <FullLoader />
  if (!isPlatformAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * Pantalla solo para ciertos roles (Finanzas, Inscripciones…). Quien no tiene el
 * permiso vuelve al inicio en vez de ver una pantalla que la base dejaría
 * vacía o rechazaría al guardar.
 */
function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = usePermissions()
  if (!can(permission)) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Paso de alta del negocio: sesión sin tenant. */
function OnboardingGuard() {
  const { loading, user, contextReady, needsOnboarding } = useAuth()
  if (loading) return <FullLoader />
  if (!user) return <Navigate to="/login" replace />
  if (!contextReady) return <FullLoader />
  if (!needsOnboarding) return <Navigate to="/" replace />
  return <OnboardingPage />
}

export default function App() {
  return (
    <AppRouter>
      <Suspense fallback={<FullLoader />}>
        <Routes>
          {/* Páginas legales: SIN guard a propósito. Tienen que abrirse con y sin
              sesión, y desde fuera de la app (un buscador, el formulario de un
              tercero, un enlace por mensaje). Ver también las URL limpias en
              public/privacidad/ y src/lib/cleanPaths.ts. */}
          <Route path={LEGAL_PATHS.privacy} element={<PrivacyPage />} />
          <Route path={LEGAL_PATHS.terms} element={<TermsPage />} />

          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/registro"
            element={
              <PublicOnly>
                <RegisterPage />
              </PublicOnly>
            }
          />
          <Route
            path="/recuperar"
            element={
              <PublicOnly>
                <ForgotPasswordPage />
              </PublicOnly>
            }
          />
          {/* Sin guard: el enlace del correo abre una sesión de recuperación, así
              que aquí se llega "autenticado" y PublicOnly lo rebotaría. */}
          <Route path="/restablecer" element={<ResetPasswordPage />} />
          <Route path="/bienvenida" element={<OnboardingGuard />} />

          {/* Panel de plataforma (super-admin, cross-tenant) */}
          <Route
            path="/admin"
            element={
              <RequirePlatformAdmin>
                <AdminPage />
              </RequirePlatformAdmin>
            }
          />
          <Route
            path="/admin/colegio/:id"
            element={
              <RequirePlatformAdmin>
                <AdminTenantDetail />
              </RequirePlatformAdmin>
            }
          />

          {/* App protegida */}
          <Route element={<ProtectedLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="estudiantes" element={<StudentsPage />} />
            <Route path="estudiantes/:id" element={<StudentDetailPage />} />
            <Route path="familias" element={<FamiliesPage />} />
            <Route
              path="inscripciones"
              element={
                <RequirePermission permission="manageStudents">
                  <EnrollmentsPage />
                </RequirePermission>
              }
            />
            <Route path="academico" element={<AcademicPage />} />
            <Route path="asistencia" element={<AttendancePage />} />
            <Route path="evaluaciones" element={<EvaluationsPage />} />
            <Route path="evaluaciones/boletin/:id" element={<ReportCardPage />} />
            <Route
              path="finanzas"
              element={
                <RequirePermission permission="handleFinance">
                  <FinancePage />
                </RequirePermission>
              }
            />
            <Route
              path="finanzas/recibo/:id"
              element={
                <RequirePermission permission="handleFinance">
                  <ReceiptPage />
                </RequirePermission>
              }
            />
            <Route path="comunicados" element={<AnnouncementsPage />} />
            <Route path="reportes" element={<ReportsPage />} />
            <Route path="manual" element={<UserManualPage />} />
            <Route path="configuracion" element={<SettingsPage />} />
            <Route path="perfil" element={<ProfilePage />} />
          </Route>

          {/* Catch-all a la raíz: desde ahí ProtectedLayout decide si toca la
              landing (sin sesión) o el panel (con sesión). */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppRouter>
  )
}
