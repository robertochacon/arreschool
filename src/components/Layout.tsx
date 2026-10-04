import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  School,
  Settings,
  ShieldCheck,
  Star,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions, type Permission } from '@/lib/permissions'
import { Wordmark, Logo } from '@/components/Logo'
import { OfflineBar } from '@/components/OfflineBar'
import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/Badge'
import { ROLE_LABEL } from '@/lib/constants'
import type { SubscriptionStatus } from '@/types/db'

/**
 * Cascarón de la app protegida: navegación, cabecera y <Outlet/>.
 *
 * Una sola lista de destinos alimenta las DOS navegaciones (barra lateral desde
 * `lg`, barra inferior en el teléfono). Duplicarla es la forma clásica de que
 * una pantalla nueva aparezca en el escritorio y no en el móvil.
 *
 * Los destinos se agrupan por las cuatro áreas de ArreSchool (Estudiantes,
 * Académico, Finanzas, Familias) y se FILTRAN por rol: una docente no ve
 * Finanzas. El filtro es cortesía: la base tampoco le devolvería ni una fila.
 *
 * Abajo, en el teléfono, caben cuatro destinos + «Más» (a 360px, por debajo de
 * ~72px por botón el texto se parte). Los cuatro se eligen por `mobile` (orden
 * de prioridad) entre los que el rol puede ver, así la docente tiene a mano
 * Asistencia y Evaluaciones en vez de Finanzas.
 */
interface NavItemDef {
  to: string
  label: string
  icon: LucideIcon
  /** Solo para '/': sin `end` la raíz quedaría activa en todas las rutas. */
  end?: boolean
  /** Sin permiso = lo ve todo el colegio. */
  permission?: Permission
  /** Prioridad para la barra inferior del teléfono (menor = antes). */
  mobile?: number
}

interface NavGroup {
  label: string | null
  items: NavItemDef[]
}

const NAV: NavGroup[] = [
  {
    label: null,
    items: [{ to: '/', label: 'Inicio', icon: LayoutDashboard, end: true, mobile: 1 }],
  },
  {
    label: 'Estudiantes',
    items: [
      { to: '/estudiantes', label: 'Estudiantes', icon: GraduationCap, mobile: 2 },
      { to: '/familias', label: 'Familias', icon: Users },
      { to: '/inscripciones', label: 'Inscripciones', icon: ClipboardList, permission: 'manageStudents' },
    ],
  },
  {
    label: 'Académico',
    items: [
      { to: '/asistencia', label: 'Asistencia', icon: CalendarCheck, mobile: 3 },
      { to: '/evaluaciones', label: 'Evaluaciones', icon: Star, mobile: 5 },
      { to: '/academico', label: 'Estructura', icon: School },
    ],
  },
  {
    label: 'Finanzas',
    items: [{ to: '/finanzas', label: 'Finanzas', icon: Wallet, permission: 'handleFinance', mobile: 4 }],
  },
  {
    label: 'Colegio',
    items: [
      { to: '/comunicados', label: 'Comunicados', icon: Megaphone },
      { to: '/reportes', label: 'Reportes', icon: BarChart3 },
      { to: '/configuracion', label: 'Configuración', icon: Settings },
      { to: '/manual', label: 'Manual de usuario', icon: BookOpen },
    ],
  },
]

const MOBILE_SLOTS = 4

/** Estado de la suscripción, en el idioma del negocio y con su color. */
const STATUS_BADGE: Record<SubscriptionStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  trial: { label: 'Prueba', tone: 'amber' },
  active: { label: 'Activo', tone: 'green' },
  past_due: { label: 'Pago pendiente', tone: 'red' },
  canceled: { label: 'Cancelado', tone: 'slate' },
}

export function Layout() {
  const { tenant, profile, plan, subscription, isPlatformAdmin, signOut } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || can(i.permission)),
  })).filter((g) => g.items.length > 0)
  const visible = groups.flatMap((g) => g.items)
  const bottom = visible
    .filter((i) => i.mobile != null)
    .sort((a, b) => (a.mobile ?? 99) - (b.mobile ?? 99))
    .slice(0, MOBILE_SLOTS)
  const rest = visible.filter((i) => !bottom.includes(i))

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/login')
  }

  // Fondo un paso más oscuro que el `bg-slate-50` del body (que se queda para la
  // landing, los legales y el login): sobre este gris las tarjetas blancas se
  // despegan y la app se lee como capas y no como una sola hoja.
  // `print:` en cada pieza del marco: recibos y boletines se imprimen desde la
  // app y no deben llevar menús ni cabecera.
  return (
    <div className="min-h-[100dvh] bg-slate-100 print:bg-white">
      {/* ── Barra lateral (desde lg) ────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex print:!hidden">
        <div className="flex h-16 items-center px-5">
          <Wordmark />
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {groups.map((g) => (
            <div key={g.label ?? 'root'} className="space-y-1">
              {g.label && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {g.label}
                </p>
              )}
              {g.items.map((item) => (
                <SideItem key={item.to} {...item} />
              ))}
            </div>
          ))}
          {/* El panel de plataforma no está en NAV: no es parte de la app del
              colegio y solo lo ve quien es super-admin. */}
          {isPlatformAdmin && <SideItem to="/admin" label="Plataforma" icon={ShieldCheck} />}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <PlanPill plan={plan.name} status={subscription?.status} />
        </div>
      </aside>

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      <div className="lg:pl-64 print:!pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur print:hidden">
          {/* En móvil no hay barra lateral, así que la marca vive aquí. */}
          <Logo className="h-8 w-8 lg:hidden" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {tenant?.name ?? 'Mi colegio'}
            </p>
            {profile?.role && (
              <p className="truncate text-xs text-slate-500">{ROLE_LABEL[profile.role]}</p>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Menú de la cuenta"
              className="flex items-center gap-2 rounded-full p-1 hover:bg-slate-100"
            >
              <Avatar name={profile?.full_name ?? tenant?.name} src={profile?.avatar_url} size="sm" />
            </button>
            {menuOpen && (
              <>
                {/* Capa invisible a pantalla completa: un toque en cualquier
                    sitio cierra el menú. Es lo que hace que funcione igual con
                    el dedo que con el ratón (no hay `blur` en un toque fuera). */}
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-card-hover animate-fade-in">
                  <div className="px-2 py-1.5">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {profile?.full_name ?? 'Mi cuenta'}
                    </p>
                    <p className="truncate text-xs text-slate-500">{tenant?.name}</p>
                  </div>
                  <div className="my-1 border-t border-slate-100" />
                  <MenuItem
                    icon={UserRound}
                    label="Mi perfil"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/perfil')
                    }}
                  />
                  <MenuItem
                    icon={Settings}
                    label="Configuración"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/configuracion')
                    }}
                  />
                  <MenuItem icon={LogOut} label="Cerrar sesión" onClick={handleSignOut} danger />
                </div>
              </>
            )}
          </div>
        </header>

        <div className="print:hidden">
          <OfflineBar />
        </div>

        {/* `pb-24` en móvil: la barra inferior es fija y taparía la última fila
            (o el botón de guardar) de cada pantalla. */}
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-24 lg:pb-8 print:max-w-none print:p-0">
          <Outlet />
        </main>
      </div>

      {/* ── Barra inferior (solo móvil) ─────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
        {bottom.map((item) => (
          <BottomItem key={item.to} {...item} />
        ))}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-slate-500"
          >
            <Menu className="h-5 w-5" />
            <span className="max-w-full truncate px-1 text-[10px] font-medium">Más</span>
          </button>
        )}
      </nav>

      {moreOpen && <MoreSheet items={rest} onClose={() => setMoreOpen(false)} />}
    </div>
  )
}

/**
 * Hoja «Más» del teléfono: el resto de destinos, con su nombre escrito. Sube
 * desde abajo, al alcance del pulgar, igual que `ActionMenu`.
 */
function MoreSheet({ items, onClose }: { items: NavItemDef[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="menu"
        aria-label="Más secciones"
        className="relative z-10 max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-card-hover animate-slide-up"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-slate-800">Más secciones</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              role="menuitem"
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-xs font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50',
                )
              }
            >
              <Icon className="h-6 w-6" />
              <span className="max-w-full truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Piezas ─────────────────────────────────────────────────────────────── */

function SideItem({ to, label, icon: Icon, end }: NavItemDef) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </NavLink>
  )
}

function BottomItem({ to, label, icon: Icon, end }: NavItemDef) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center gap-0.5 py-2',
          isActive ? 'text-brand-600' : 'text-slate-500',
        )
      }
    >
      <Icon className="h-5 w-5" />
      {/* 10px y `truncate`: «Evaluaciones» no cabe entera a 360px y sin esto
          rompería el reparto en cinco columnas iguales. */}
      <span className="max-w-full truncate px-1 text-[10px] font-medium">{label}</span>
    </NavLink>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

/** Plan vigente al pie de la barra lateral: recuerda en qué plan se está sin
 *  tener que entrar a Configuración. */
function PlanPill({ plan, status }: { plan: string; status?: SubscriptionStatus }) {
  const badge = status ? STATUS_BADGE[status] : null
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">Plan</p>
        <p className="truncate text-sm font-semibold text-slate-800">{plan}</p>
      </div>
      {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
    </div>
  )
}
